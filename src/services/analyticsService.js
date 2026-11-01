import {
  calculateOrientationAndShadowFactor,
  calculateEnvironmentalEvaporation,
  analyzeWeatherRisks,
  PLANT_TYPES,
  POT_MATERIALS,
  POT_SIZES,
  SUN_EXPOSURES
} from '../engine/irrigationEngine.js';

/**
 * Genera la serie temporal de análisis para una maceta dada:
 * Recorre desde los días pasados (histórico de Open-Meteo) hasta la previsión futura (7-10 días).
 * Calcula:
 * - Humedad esperada del sustrato día a día (%)
 * - Registro de riegos reales ocurridos
 * - Detección de reajustes (si el riego se adelantó/retrasó o cambió la dosis)
 * - Próximo riego proyectado
 * - Temperaturas máx/mín y alertas de helada
 * - Lluvia ambiental vs lluvia absorbida
 */
export function generatePotAnalyticsTimeline(pot, weather, customSettings = {}, logs = []) {
  if (!pot || !weather || !weather.allDays || weather.allDays.length === 0) {
    return {
      days: [],
      pot,
      reajustes: [],
      nextWateringExpected: null,
      summary: null
    };
  }

  const currentDate = new Date();
  const formatYMD = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const todayStr = formatYMD(currentDate);

  // Parámetros botánicos de la maceta
  const defaultPlant = PLANT_TYPES[pot.plantType] || PLANT_TYPES.foliage;
  const customPlant = customSettings?.plantTypes?.[pot.plantType] || {};
  const plant = { ...defaultPlant, ...customPlant };

  const rawMaterial = pot.container ? pot.container.material : pot.material;
  const defaultMaterial = POT_MATERIALS[rawMaterial] || POT_MATERIALS.terracotta;
  const customMat = customSettings?.materials?.[rawMaterial] || {};
  const material = { ...defaultMaterial, ...customMat };

  const defaultSize = POT_SIZES[pot.size] || POT_SIZES.medium;
  const customSz = customSettings?.sizes?.[pot.size] || {};
  const size = { ...defaultSize, ...customSz };

  const rawSun = pot.container ? pot.container.sunExposure : pot.sunExposure;
  const defaultSun = SUN_EXPOSURES[rawSun] || SUN_EXPOSURES.partial_sun;
  const customSn = customSettings?.sunExposures?.[rawSun] || {};
  const sun = { ...defaultSun, ...customSn };

  const isCovered = pot.container ? Boolean(pot.container.isCovered) : Boolean(pot.isCovered);

  let sizeMultiplier = size.dryingMultiplier;
  if (pot.container) {
    const sections = Math.max(1, pot.container.sections || 1);
    const effectiveSectionLiters = (pot.container.totalLiters || 32) / sections;
    if (effectiveSectionLiters >= 20) {
      sizeMultiplier = 0.70;
    } else if (effectiveSectionLiters >= 10) {
      sizeMultiplier = 0.85;
    } else {
      sizeMultiplier = 1.05;
    }
  }

  const zone = pot.zone || pot.container?.zone || null;
  const rawOrientation = pot.orientation || zone?.orientation || pot.container?.orientation || 'south';
  const customOrientation = customSettings?.orientations?.[rawOrientation] || {};
  const shadow = pot.shadow || zone?.shadow || pot.container?.shadow || 'none';
  const microclimate = calculateOrientationAndShadowFactor({
    orientation: rawOrientation,
    shadow,
    baseExposure: rawSun
  });

  if (customOrientation.dryingMultiplier) {
    microclimate.microclimateMultiplier = customOrientation.dryingMultiplier * microclimate.shadowFactor;
  }

  // Factor de secado base intrínseco
  // Si la maceta tiene factor aprendido de calibraciones previas (WASM o prueba del dedo), se aplica
  const learnedFactor = pot.learnedDryingFactor || 1.0;
  const baseDryingFactorWithoutEnv = (
    plant.waterDemandFactor *
    material.dryingMultiplier *
    sizeMultiplier *
    sun.dryingMultiplier *
    microclimate.microclimateMultiplier *
    learnedFactor
  );

  const baseInterval = (plant.minDaysBetweenWatering + plant.maxDaysBetweenWatering) / 2;
  const moistureThreshold = customSettings?.weatherThresholds?.moistureThreshold ?? 30;
  const soakRainThreshold = customSettings?.weatherThresholds?.rainSoakThreshold ?? 15;
  const minEffectiveRain = customSettings?.weatherThresholds?.rainMinEffective ?? 4;

  // Filtrar logs de riego correspondientes a esta maceta
  const potLogs = (logs || []).filter(l => l.potId === pot.id);
  const potLogsByDate = {};
  potLogs.forEach(l => {
    const dStr = (l.date || '').split('T')[0];
    if (dStr) {
      if (!potLogsByDate[dStr]) potLogsByDate[dStr] = [];
      potLogsByDate[dStr].push(l);
    }
  });

  // Fecha del último riego registrado
  const lastWateredDateStr = pot.lastWatered ? pot.lastWatered.split('T')[0] : null;

  // Ordenar los días cronológicamente
  const allDays = [...weather.allDays].sort((a, b) => a.date.localeCompare(b.date));

  // Simulación continua de balance hídrico
  let currentMoisture = 100;
  let reajustes = [];
  const daysResult = [];
  let nextWateringProjectedDate = null;

  for (let i = 0; i < allDays.length; i++) {
    const day = allDays[i];
    const dateStr = day.date;
    const isPast = dateStr < todayStr;
    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;

    // 1. Tasa de drenaje del día
    const dayEnv = calculateEnvironmentalEvaporation(day, customSettings);
    const dayComposite = baseDryingFactorWithoutEnv * dayEnv;
    const dayEffInterval = Math.max(0.8, baseInterval / dayComposite);
    const dayDrain = 100 / dayEffInterval;

    // 2. Comprobar si hubo un riego real registrado en esta fecha
    const logsOnDay = potLogsByDate[dateStr] || [];
    const hadRealWatering = logsOnDay.length > 0 || (lastWateredDateStr === dateStr);

    let wateringEvent = null;
    let reajusteEvent = null;

    if (hadRealWatering) {
      const log = logsOnDay[0] || {};
      const note = log.notes || 'Riego registrado';
      wateringEvent = {
        type: 'real',
        glasses: pot.calibratedGlasses || 2.0,
        ml: pot.calibratedDoseMl || Math.round((pot.calibratedGlasses || 2.0) * 250),
        note
      };

      // Si el riego ocurrió cuando la humedad no estaba en el umbral, detectamos reajuste
      if (currentMoisture > moistureThreshold + 15) {
        reajusteEvent = {
          date: dateStr,
          type: 'early_watering',
          desc: `Riego preventivo anticipado (${Math.round(currentMoisture)}% humedad). Sustrato recargado al 100%.`,
          note
        };
        reajustes.push(reajusteEvent);
      } else if (currentMoisture < moistureThreshold - 10) {
        reajusteEvent = {
          date: dateStr,
          type: 'delayed_watering',
          desc: `Riego aplicado con sustrato bajo (${Math.round(currentMoisture)}%).`,
          note
        };
        reajustes.push(reajusteEvent);
      } else if (note.includes('reducido') || note.includes('inercia') || note.includes('extra') || pot.calibrationCount > 0) {
        reajusteEvent = {
          date: dateStr,
          type: 'dose_calibration',
          desc: note,
          note
        };
        reajustes.push(reajusteEvent);
      }

      currentMoisture = 100;
    }

    // 3. Drenaje natural por evapotranspiración
    const moistureBeforeDrain = currentMoisture;
    currentMoisture = Math.max(0, currentMoisture - dayDrain);

    // 4. Lluvia natural absorbida (si no está bajo techo)
    let rainAbsorbed = 0;
    const rain = day.rainSum || 0;
    if (!isCovered && rain > 0) {
      if (rain >= soakRainThreshold) {
        currentMoisture = 100;
        rainAbsorbed = rain;
      } else if (rain >= minEffectiveRain) {
        const recharge = Math.min(60, rain * 5);
        currentMoisture = Math.min(100, currentMoisture + recharge);
        rainAbsorbed = rain;
      } else {
        const recharge = Math.min(25, rain * 3);
        currentMoisture = Math.min(100, currentMoisture + recharge);
        rainAbsorbed = rain;
      }
    }

    // 5. Previsión futura: si cae al umbral de riego y no se ha marcado ya un siguiente riego
    let isProjectedWatering = false;
    const isFrostDay = (day.minTemp <= 2);
    const isFreezingDay = (day.minTemp <= 0);

    if (isFuture && !nextWateringProjectedDate) {
      if (currentMoisture <= moistureThreshold) {
        if (isFreezingDay) {
          // Bloqueo preventivo por helada
          reajusteEvent = {
            date: dateStr,
            type: 'frost_postponed',
            desc: `🚫 Riego suspendido por helada prevista (${day.minTemp}°C). Se pospone para proteger las raíces.`
          };
          reajustes.push(reajusteEvent);
        } else {
          isProjectedWatering = true;
          nextWateringProjectedDate = dateStr;
          wateringEvent = {
            type: 'projected',
            doseMl: pot.calibratedDoseMl || 500,
            note: 'Riego proyectado por el algoritmo'
          };
        }
      }
    }

    daysResult.push({
      date: dateStr,
      isPast,
      isToday,
      isFuture,
      maxTemp: Math.round(day.maxTemp * 10) / 10,
      minTemp: Math.round(day.minTemp * 10) / 10,
      rainSum: Math.round((day.rainSum || 0) * 10) / 10,
      rainAbsorbed: Math.round(rainAbsorbed * 10) / 10,
      et0: Math.round((day.et0 || 3.0) * 10) / 10,
      moisturePercent: Math.round(currentMoisture),
      dayDrain: Math.round(dayDrain * 10) / 10,
      moistureThreshold,
      isFrostDay,
      isFreezingDay,
      wateringEvent,
      reajusteEvent
    });
  }

  return {
    days: daysResult,
    pot,
    reajustes,
    nextWateringExpected: nextWateringProjectedDate,
    threshold: moistureThreshold,
    learnedFactor: Math.round(learnedFactor * 100) / 100,
    isCovered,
    summary: {
      totalDays: daysResult.length,
      realWateringsCount: daysResult.filter(d => d.wateringEvent && d.wateringEvent.type === 'real').length,
      frostDaysCount: daysResult.filter(d => d.isFrostDay).length,
      reajustesCount: reajustes.length
    }
  };
}
