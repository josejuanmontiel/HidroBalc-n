package main

import (
	"encoding/json"
	"fmt"
	"math"
	"syscall/js"
)

// PotData representa los datos de entrada de la maceta
type PotData struct {
	ID                     string  `json:"id"`
	Name                   string  `json:"name"`
	PlantType              string  `json:"plantType"`
	Material               string  `json:"material"`
	Size                   string  `json:"size"`
	SunExposure            string  `json:"sunExposure"`
	IsCovered              bool    `json:"isCovered"`
	LearnedDryingFactor    float64 `json:"learnedDryingFactor"`    // Factor adaptativo (1.0 por defecto)
	CalibratedDoseMl       int     `json:"calibratedDoseMl"`       // Dosis adaptada (ml)
	CalibrationCount       int     `json:"calibrationCount"`       // Número de retroalimentaciones
}

// WeatherSnapshot representa las condiciones térmicas
type WeatherSnapshot struct {
	MaxTemp float64 `json:"maxTemp"`
	MinTemp float64 `json:"minTemp"`
	AvgTemp float64 `json:"avgTemp"`
	RainSum float64 `json:"rainSum"`
	Et0     float64 `json:"et0"`
}

// FeedbackData representa la observación de la "Prueba del Dedo"
type FeedbackData struct {
	DaysElapsed            float64 `json:"daysElapsed"`            // Días transcurridos desde el último riego
	ObservedMoistureLevel  int     `json:"observedMoistureLevel"`  // 0 (muy seco), 1 (húmedo solo al fondo), 2 (óptimo 1-2cm), 3 (mojado superficial)
	WaterGivenGlasses      float64 `json:"waterGivenGlasses"`      // Vasos de agua que se echaron
	MeanTempObserved       float64 `json:"meanTempObserved"`       // Temperatura media observada en ese periodo
}

// DoseOutput resultado de la dosificación
type DoseOutput struct {
	DoseMl          int     `json:"doseMl"`
	DoseGlasses     float64 `json:"doseGlasses"`
	DoseLiters      float64 `json:"doseLiters"`
	Explanation     string  `json:"explanation"`
	IsAdapted       bool    `json:"isAdapted"`
}

// CalibrationResult resultado del aprendizaje adaptativo
type CalibrationResult struct {
	Success                 bool       `json:"success"`
	NewLearnedDryingFactor  float64    `json:"newLearnedDryingFactor"`
	NewDoseMl               int        `json:"newDoseMl"`
	NewDoseGlasses          float64    `json:"newDoseGlasses"`
	CalibrationCount        int        `json:"calibrationCount"`
	Message                 string     `json:"message"`
	DryingDifferencePercent float64    `json:"dryingDifferencePercent"`
}

// calculateBaseVolumeMl estima el volumen de sustrato y agua inicial recomendada
func getBaseSubstrateLiters(size string) float64 {
	switch size {
	case "small":
		return 1.8 // maceta pequeña ~ 1.8 L
	case "medium":
		return 5.5 // maceta mediana ~ 5.5 L
	case "large":
		return 16.0 // maceta grande ~ 16 L
	case "planter":
		return 32.0 // jardinera corrida ~ 32 L
	default:
		return 5.0
	}
}

// calculateRecommendedDose calcula la dosis de agua óptima en ml
func calculateRecommendedDose(pot PotData, weather WeatherSnapshot) DoseOutput {
	substrateLiters := getBaseSubstrateLiters(pot.Size)

	// Regla agronómica: Capacidad de campo útil en maceta es entre 15% y 22% del volumen de sustrato
	baseWaterRatio := 0.18

	// Ajuste por tipo de planta
	switch pot.PlantType {
	case "succulent_cactus":
		baseWaterRatio = 0.08
	case "aromatic_woody":
		baseWaterRatio = 0.14
	case "vegetable": // tomates, pimientos
		baseWaterRatio = 0.24
	case "flowering":
		baseWaterRatio = 0.20
	case "citrus":
		baseWaterRatio = 0.21
	}

	// Ajuste por material de maceta (el barro absorbe agua en sus paredes secas)
	materialMultiplier := 1.0
	if pot.Material == "terracotta" {
		materialMultiplier = 1.25 // +25% de agua extra porque la pared de barro bebe agua
	}

	// Ajuste por calor extremo (si maxTemp > 32°C, evaporación inicial rápida)
	heatMultiplier := 1.0
	if weather.MaxTemp >= 35 {
		heatMultiplier = 1.3
	} else if weather.MaxTemp >= 30 {
		heatMultiplier = 1.15
	} else if weather.MaxTemp < 15 {
		heatMultiplier = 0.85
	}

	// Factor aprendido por retroalimentación previa
	learnedFactor := pot.LearnedDryingFactor
	if learnedFactor <= 0.1 {
		learnedFactor = 1.0
	}

	rawDoseMl := substrateLiters * baseWaterRatio * materialMultiplier * heatMultiplier * 1000.0 * (0.8 + 0.2*learnedFactor)

	// Si ya había una dosis calibrada previa, mezclar con suavizado (EMA)
	if pot.CalibratedDoseMl > 0 {
		rawDoseMl = float64(pot.CalibratedDoseMl)*0.6 + rawDoseMl*0.4
	}

	doseMl := int(math.Round(rawDoseMl/25.0) * 25) // redondear a múltiplos de 25ml
	if doseMl < 100 {
		doseMl = 100
	}

	// 1 vaso estándar de cocina = 250 ml
	glasses := math.Round((float64(doseMl)/250.0)*2.0) / 2.0
	if glasses < 0.5 {
		glasses = 0.5
	}
	liters := math.Round((float64(doseMl)/1000.0)*100.0) / 100.0

	var explanation string
	if glasses <= 1.0 {
		explanation = fmt.Sprintf("%.1f vaso (~%d ml) vertido despacio en la base.", glasses, doseMl)
	} else if glasses < 4.0 {
		explanation = fmt.Sprintf("%.1f vasos (~%d ml), idealmente en 2 tandas para que el sustrato absorba sin desbordar.", glasses, doseMl)
	} else {
		explanation = fmt.Sprintf("%.2f L (~%.1f vasos), regadera con difusor circular para empapar homogéneamente.", liters, glasses)
	}

	return DoseOutput{
		DoseMl:      doseMl,
		DoseGlasses: glasses,
		DoseLiters:  liters,
		Explanation: explanation,
		IsAdapted:   pot.CalibrationCount > 0,
	}
}

// calibrateAdaptiveModel implementa el bucle de retroalimentación con la prueba del dedo
func calibrateAdaptiveModel(pot PotData, fb FeedbackData) CalibrationResult {
	currentFactor := pot.LearnedDryingFactor
	if currentFactor <= 0.1 {
		currentFactor = 1.0
	}

	// 1. Estimar cuántos días debería haber durado el riego según el modelo físico actual
	// Días esperados para que el sustrato baje a nivel seco (Nivel 0 o 1):
	expectedDaysToDry := 3.0 / currentFactor
	if pot.Material == "terracotta" {
		expectedDaysToDry *= 0.7 // barro se seca antes
	}
	if pot.SunExposure == "full_sun" {
		expectedDaysToDry *= 0.75
	}
	if fb.MeanTempObserved > 28 {
		expectedDaysToDry *= (24.0 / fb.MeanTempObserved)
	}

	// 2. Nivel esperado de humedad hoy según los días transcurridos
	var expectedLevel float64
	if fb.DaysElapsed <= 0.5 {
		expectedLevel = 3.0 // recién regado
	} else if fb.DaysElapsed >= expectedDaysToDry {
		expectedLevel = 0.2 // ya debería estar seco
	} else {
		expectedLevel = 3.0 * (1.0 - (fb.DaysElapsed / expectedDaysToDry))
	}

	// 3. Error de predicción (Discrepancia entre la prueba del dedo y el modelo)
	// observed: 0 (seco total), 1 (húmedo solo fondo), 2 (húmedo medio), 3 (muy mojado)
	observed := float64(fb.ObservedMoistureLevel)
	errorDiscrepancy := expectedLevel - observed

	// Si errorDiscrepancy > 0: la planta está MÁS SECA de lo que el modelo pensaba (secado más rápido o poca agua)
	// Si errorDiscrepancy < 0: la planta está MÁS HÚMEDA de lo que se pensaba (secado lento o exceso de agua)

	// Factor de aprendizaje (tasa de aprendizaje alfa = 0.25)
	alpha := 0.25
	correction := (errorDiscrepancy / 3.0) * alpha
	newFactor := currentFactor * (1.0 + correction)

	// Límites de seguridad agronómica para el factor de secado (entre 0.4x y 2.8x)
	if newFactor < 0.4 {
		newFactor = 0.4
	}
	if newFactor > 2.8 {
		newFactor = 2.8
	}

	diffPercent := math.Round(((newFactor - currentFactor) / currentFactor) * 100.0)

	// Ajuste en la dosis recomendada (ml)
	baseDose := calculateRecommendedDose(pot, WeatherSnapshot{MaxTemp: fb.MeanTempObserved, MinTemp: 15})
	newDoseMl := baseDose.DoseMl

	var message string
	if math.Abs(diffPercent) < 4 {
		message = fmt.Sprintf("✅ ¡Calibración perfecta! Tu prueba del dedo (%d/3) coincide con la predicción a %.1f días con %.1f°C.",
			fb.ObservedMoistureLevel, fb.DaysElapsed, fb.MeanTempObserved)
	} else if diffPercent > 0 {
		newDoseMl = int(math.Round(float64(baseDose.DoseMl)*1.18/25.0) * 25)
		newGlasses := math.Round((float64(newDoseMl)/250.0)*2.0) / 2.0
		message = fmt.Sprintf("📈 Retroalimentación Wasm: El sustrato se secó un +%.0f%% más rápido de lo estimado a %.1f°C. Se incrementa la dosis a %.1f vasos (%d ml) y se adelanta el próximo ciclo.",
			diffPercent, fb.MeanTempObserved, newGlasses, newDoseMl)
	} else {
		newDoseMl = int(math.Round(float64(baseDose.DoseMl)*0.85/25.0) * 25)
		newGlasses := math.Round((float64(newDoseMl)/250.0)*2.0) / 2.0
		message = fmt.Sprintf("📉 Retroalimentación Wasm: El cepellón retiene un +%.0f%% más de humedad de lo previsto. Se modera la dosis a %.1f vasos (%d ml) para proteger las raíces de pudrición.",
			math.Abs(diffPercent), newGlasses, newDoseMl)
	}

	newGlasses := math.Round((float64(newDoseMl)/250.0)*2.0) / 2.0

	return CalibrationResult{
		Success:                 true,
		NewLearnedDryingFactor:  math.Round(newFactor*100.0) / 100.0,
		NewDoseMl:               newDoseMl,
		NewDoseGlasses:          newGlasses,
		CalibrationCount:        pot.CalibrationCount + 1,
		Message:                 message,
		DryingDifferencePercent: diffPercent,
	}
}

// Wrapper JS para calculateDose
func calculateDoseWrapper(this js.Value, args []js.Value) any {
	if len(args) < 2 {
		return js.ValueOf(`{"error": "Faltan argumentos (potJson, weatherJson)"}`)
	}

	potJsonStr := args[0].String()
	weatherJsonStr := args[1].String()

	var pot PotData
	var weather WeatherSnapshot

	if err := json.Unmarshal([]byte(potJsonStr), &pot); err != nil {
		return js.ValueOf(fmt.Sprintf(`{"error": "JSON maceta inválido: %s"}`, err))
	}
	if err := json.Unmarshal([]byte(weatherJsonStr), &weather); err != nil {
		return js.ValueOf(fmt.Sprintf(`{"error": "JSON clima inválido: %s"}`, err))
	}

	out := calculateRecommendedDose(pot, weather)
	resBytes, _ := json.Marshal(out)
	return js.ValueOf(string(resBytes))
}

// Wrapper JS para calibrateModel
func calibrateModelWrapper(this js.Value, args []js.Value) any {
	if len(args) < 2 {
		return js.ValueOf(`{"error": "Faltan argumentos (potJson, feedbackJson)"}`)
	}

	potJsonStr := args[0].String()
	feedbackJsonStr := args[1].String()

	var pot PotData
	var fb FeedbackData

	if err := json.Unmarshal([]byte(potJsonStr), &pot); err != nil {
		return js.ValueOf(fmt.Sprintf(`{"error": "JSON maceta inválido: %s"}`, err))
	}
	if err := json.Unmarshal([]byte(feedbackJsonStr), &fb); err != nil {
		return js.ValueOf(fmt.Sprintf(`{"error": "JSON feedback inválido: %s"}`, err))
	}

	out := calibrateAdaptiveModel(pot, fb)
	resBytes, _ := json.Marshal(out)
	return js.ValueOf(string(resBytes))
}

func main() {
	c := make(chan struct{}, 0)

	// Crear objeto global en window
	js.Global().Set("HidroBalconWasm", js.ValueOf(map[string]any{
		"calculateDose":  js.FuncOf(calculateDoseWrapper),
		"calibrateModel": js.FuncOf(calibrateModelWrapper),
		"version":        "1.0.0-wasm-golang",
	}))

	fmt.Println("🌱 HidroBalcón Wasm (Go 1.24) inicializado con éxito.")
	<-c
}
