/**
 * Servicio de Integración con el Motor WebAssembly en Go (Golang 1.24)
 * Ejecuta cálculos de dosificación agronómica y calibración adaptativa offline
 * con retroalimentación de la "Prueba del Dedo" y temperaturas del día.
 */

class WasmEngineService {
  constructor() {
    this.isReady = false;
    this.initPromise = this.initWasm();
  }

  async initWasm() {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

      // Cargar wasm_exec.js si no está ya presente
      if (typeof Go === 'undefined') {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = `${cleanBase}wasm_exec.js`;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const go = new Go();
      let wasmModule;
      const wasmUrl = `${cleanBase}engine.wasm`;

      if ('instantiateStreaming' in WebAssembly) {
        try {
          const res = await WebAssembly.instantiateStreaming(fetch(wasmUrl), go.importObject);
          wasmModule = res.instance;
        } catch {
          // Fallback a ArrayBuffer si streaming falla
          const response = await fetch(wasmUrl);
          const bytes = await response.arrayBuffer();
          const res = await WebAssembly.instantiate(bytes, go.importObject);
          wasmModule = res.instance;
        }
      } else {
        const response = await fetch(wasmUrl);
        const bytes = await response.arrayBuffer();
        const res = await WebAssembly.instantiate(bytes, go.importObject);
        wasmModule = res.instance;
      }

      // Iniciar el runtime de Go (se ejecuta en segundo plano)
      go.run(wasmModule);
      this.isReady = true;
      console.log('🌱 Motor WebAssembly en Go cargado y activo.');
      return true;
    } catch (e) {
      console.warn('Motor Wasm no disponible, utilizando motor matemático nativo JS:', e);
      this.isReady = false;
      return false;
    }
  }

  /**
   * Calcula la dosis óptima recomendada (en ml y vasos de cocina)
   */
  async calculateDose(pot, weather) {
    await this.initPromise;

    if (this.isReady && window.HidroBalconWasm && window.HidroBalconWasm.calculateDose) {
      try {
        let effectiveSize = pot.size;
        if (pot.container) {
          const sections = Math.max(1, pot.container.sections || 1);
          const liters = (pot.container.totalLiters || 32) / sections;
          if (liters <= 3) effectiveSize = 'small';
          else if (liters <= 10) effectiveSize = 'medium';
          else if (liters <= 25) effectiveSize = 'large';
          else effectiveSize = 'planter';
        }

        const potJson = JSON.stringify({
          id: pot.id,
          name: pot.name,
          plantType: pot.plantType,
          material: pot.container ? pot.container.material : pot.material,
          size: effectiveSize,
          sunExposure: pot.container ? pot.container.sunExposure : pot.sunExposure,
          isCovered: pot.container ? Boolean(pot.container.isCovered) : Boolean(pot.isCovered),
          learnedDryingFactor: pot.learnedDryingFactor || 1.0,
          calibratedDoseMl: pot.calibratedDoseMl || 0,
          calibrationCount: pot.calibrationCount || 0
        });

        const weatherJson = JSON.stringify({
          maxTemp: weather?.maxTemp ?? 24,
          minTemp: weather?.minTemp ?? 15,
          avgTemp: weather?.currentTemp ?? 20,
          rainSum: weather?.rainSum ?? 0,
          et0: weather?.et0 ?? 3.5
        });

        const resStr = window.HidroBalconWasm.calculateDose(potJson, weatherJson);
        const res = JSON.parse(resStr);
        if (!res.error) {
          return res;
        }
      } catch (err) {
        console.warn('Fallo llamada Wasm calculateDose, usando fallback JS:', err);
      }
    }

    // Fallback matemático JS
    return this.calculateDoseFallback(pot, weather);
  }

  /**
   * Ejecuta el bucle de retroalimentación con la prueba del dedo
   * @param {Object} pot
   * @param {Object} feedback - { daysElapsed, observedMoistureLevel, waterGivenGlasses, meanTempObserved }
   */
  async calibrateWithFingerTest(pot, feedback) {
    await this.initPromise;

    if (this.isReady && window.HidroBalconWasm && window.HidroBalconWasm.calibrateModel) {
      try {
        let effectiveSize = pot.size;
        if (pot.container) {
          const sections = Math.max(1, pot.container.sections || 1);
          const liters = (pot.container.totalLiters || 32) / sections;
          if (liters <= 3) effectiveSize = 'small';
          else if (liters <= 10) effectiveSize = 'medium';
          else if (liters <= 25) effectiveSize = 'large';
          else effectiveSize = 'planter';
        }

        const potJson = JSON.stringify({
          id: pot.id,
          name: pot.name,
          plantType: pot.plantType,
          material: pot.container ? pot.container.material : pot.material,
          size: effectiveSize,
          sunExposure: pot.container ? pot.container.sunExposure : pot.sunExposure,
          isCovered: pot.container ? Boolean(pot.container.isCovered) : Boolean(pot.isCovered),
          learnedDryingFactor: pot.learnedDryingFactor || 1.0,
          calibratedDoseMl: pot.calibratedDoseMl || 0,
          calibrationCount: pot.calibrationCount || 0
        });

        const feedbackJson = JSON.stringify({
          daysElapsed: feedback.daysElapsed || 2.0,
          observedMoistureLevel: feedback.observedMoistureLevel ?? 1,
          waterGivenGlasses: feedback.waterGivenGlasses || 2.0,
          meanTempObserved: feedback.meanTempObserved || 22.0
        });

        const resStr = window.HidroBalconWasm.calibrateModel(potJson, feedbackJson);
        const res = JSON.parse(resStr);
        if (!res.error) {
          return res;
        }
      } catch (err) {
        console.warn('Fallo llamada Wasm calibrateModel, usando fallback JS:', err);
      }
    }

    // Fallback de calibración JS
    return this.calibrateFallback(pot, feedback);
  }

  // Fallbacks JavaScript en caso de que Wasm esté inicializándose o en Node
  calculateDoseFallback(pot, weather) {
    let substrateLiters = 5.0;
    if (pot.substrateLiters && typeof pot.substrateLiters === 'number' && pot.substrateLiters > 0) {
      substrateLiters = pot.substrateLiters;
    } else if (pot.dimensions && pot.shape === 'round' && pot.dimensions.diameter && pot.dimensions.height) {
      const r = pot.dimensions.diameter / 2;
      substrateLiters = Math.round((Math.PI * Math.pow(r, 2) * pot.dimensions.height / 1000) * 10) / 10;
    } else if (pot.dimensions && pot.dimensions.length && pot.dimensions.width && pot.dimensions.depth) {
      substrateLiters = Math.round(((pot.dimensions.length * pot.dimensions.width * pot.dimensions.depth) / 1000) * 10) / 10;
    } else if (pot.container) {
      const sections = Math.max(1, pot.container.sections || 1);
      substrateLiters = (pot.container.totalLiters || 32.0) / sections;
    } else {
      if (pot.size === 'small') substrateLiters = 1.8;
      else if (pot.size === 'medium') substrateLiters = 5.5;
      else if (pot.size === 'large') substrateLiters = 16.0;
      else if (pot.size === 'planter') substrateLiters = 32.0;
    }

    let ratio = 0.18;
    if (pot.plantType === 'vegetable') ratio = 0.24;
    else if (pot.plantType === 'succulent_cactus') ratio = 0.08;

    const rawMat = pot.container ? pot.container.material : pot.material;
    let mat = rawMat === 'terracotta' ? 1.25 : 1.0;
    let heat = (weather?.maxTemp ?? 25) > 32 ? 1.2 : 1.0;
    let factor = pot.learnedDryingFactor || 1.0;

    let ml = Math.round((substrateLiters * ratio * mat * heat * 1000 * (0.8 + 0.2 * factor)) / 25) * 25;
    if (pot.calibratedDoseMl) {
      ml = Math.round((pot.calibratedDoseMl * 0.6 + ml * 0.4) / 25) * 25;
    }
    ml = Math.max(100, ml);
    const glasses = Math.round((ml / 250) * 2) / 2;
    const liters = Math.round((ml / 1000) * 100) / 100;

    return {
      doseMl: ml,
      doseGlasses: glasses,
      doseLiters: liters,
      explanation: `${glasses} vaso(s) (~${ml} ml), agua vertida en la base del sustrato.`,
      isAdapted: Boolean(pot.calibrationCount > 0)
    };
  }

  calibrateFallback(pot, feedback) {
    const currentFactor = pot.learnedDryingFactor || 1.0;
    const observed = feedback.observedMoistureLevel ?? 1;
    let delta = 0;
    if (observed <= 1 && feedback.daysElapsed <= 2.5) {
      delta = 0.20; // secado más rápido de lo esperado
    } else if (observed >= 2 && feedback.daysElapsed >= 3.5) {
      delta = -0.15; // retiene más humedad
    }

    const newFactor = Math.max(0.4, Math.min(2.8, Math.round((currentFactor * (1 + delta)) * 100) / 100));
    const dose = this.calculateDoseFallback({ ...pot, learnedDryingFactor: newFactor }, { maxTemp: feedback.meanTempObserved });

    return {
      success: true,
      newLearnedDryingFactor: newFactor,
      newDoseMl: dose.doseMl,
      newDoseGlasses: dose.doseGlasses,
      calibrationCount: (pot.calibrationCount || 0) + 1,
      message: delta > 0
        ? `📈 Retroalimentación: Secado más rápido a ${feedback.meanTempObserved}°C. Dosis ajustada a ${dose.doseGlasses} vasos.`
        : (delta < 0 ? `📉 Retroalimentación: El sustrato retiene bien el agua. Dosis moderada a ${dose.doseGlasses} vasos.` : `✅ Sustrato en equilibrio óptimo.`),
      dryingDifferencePercent: Math.round(delta * 100)
    };
  }
}

export const wasmEngineService = new WasmEngineService();
