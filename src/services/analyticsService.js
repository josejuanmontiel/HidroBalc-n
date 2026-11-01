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
 * - Humedad esperada del sustrato día a día con el modelo calibrado (%)
 * - Humedad teórica base sin calibrar (%) para visualizar el reajuste
 * - Tasa de drenaje diario (% de evaporación/día)
 * - Registro de riegos reales ocurridos (incluyendo riegos individuales y generales potId === 'all')
 * - Detección de reajustes (si el riego se adelantó/retrasó o cambió la dosis)
 * - Desglose de parámetros y coeficientes agronómicos de la maceta
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
      summary: null,
      factors: null
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
  let containerDescription = 'Maceta independiente';
  if (pot.container) {
    const sections = Math.max(1, pot.container.sections || 1);
    const effectiveSectionLiters = (pot.container.totalLiters || 32) / sections;
    if (effectiveSectionLiters >= 20) {
      sizeMultiplier = 0.70;
      containerDescription = `Jardinera grande (${pot.container.totalLiters}L / ${sections} sec, inercia alta)`;
    } else if (effectiveSectionLiters >= 10) {
      sizeMultiplier = 0.85;
      containerDescription = `Jardinera mediana (${pot.container.totalLiters}L / ${sections} sec, inercia media)`;
    } else {
      sizeMultiplier = 1.05;
      containerDescription = `Jardinera compacta (${pot.container.totalLiters}L / ${sections} sec)`;
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

  // 1. FACTOR TEÓRICO BASE (Sin calibración de usuario, modelo agronómico puro)
  const theoreticalBaseDryingFactor = (
    plant.waterDemandFactor *
    material.dryingMultiplier *
    sizeMultiplier *
    sun.dryingMultiplier *
    microclimate.microclimateMultiplier
  );

  // 2. FACTOR REAL CALIBRADO (Incorpora aprendizaje del usuario y calibraciones WASM)
  const learnedFactor = pot.learnedDryingFactor || 1.0;
  const calibratedBaseDryingFactor = theoreticalBaseDryingFactor * learnedFactor;

  const baseInterval = (plant.minDaysBetweenWatering + plant.maxDaysBetweenWatering) / 2;
  const moistureThreshold = customSettings?.weatherThresholds?.moistureThreshold ?? 30;
  const soakRainThreshold = customSettings?.weatherThresholds?.rainSoakThreshold ?? 15;
  const minEffectiveRain = customSettings?.weatherThresholds?.rainMinEffective ?? 4;

  // Filtrar logs de riego correspondientes a esta maceta O riegos generales a toda la terraza (potId === 'all')
  const potLogs = (logs || []).filter(l => l.potId === pot.id || l.potId === 'all');
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

  // Simulación simultánea de:
  // - Humedad real calibrada (currentMoisture)
  // - Humedad teórica base no calibrada (theoreticalMoisture)
  let currentMoisture = 100;
  let theoreticalMoisture = 100;
  let reajustes = [];
  const daysResult = [];
  let nextWateringProjectedDate = null;
  let nextTheoreticalProjectedDate = null;

  for (let i = 0; i < allDays.length; i++) {
    const day = allDays[i];
    const dateStr = day.date;
    const isPast = dateStr < todayStr;
    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;

    // 1. Tasa de drenaje del día (Calibrada vs Teórica)
    const dayEnv = calculateEnvironmentalEvaporation(day, customSettings);

    const dayCompositeCalibrated = calibratedBaseDryingFactor * dayEnv;
    const dayEffIntervalCalibrated = Math.max(0.8, baseInterval / dayCompositeCalibrated);
    const dayDrainCalibrated = 100 / dayEffIntervalCalibrated;

    const dayCompositeTheoretical = theoreticalBaseDryingFactor * dayEnv;
    const dayEffIntervalTheoretical = Math.max(0.8, baseInterval / dayCompositeTheoretical);
    const dayDrainTheoretical = 100 / dayEffIntervalTheoretical;

    // 2. Comprobar si hubo un riego real registrado en esta fecha
    const logsOnDay = potLogsByDate[dateStr] || [];
    const hadRealWatering = logsOnDay.length > 0 || (lastWateredDateStr === dateStr);

    let wateringEvent = null;
    let reajusteEvent = null;

    if (hadRealWatering) {
      const log = logsOnDay[0] || {};
      const note = log.notes || (log.potId === 'all' ? 'Riego general de terraza' : 'Riego registrado');
      wateringEvent = {
        type: 'real',
        isGeneral: log.potId === 'all',
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
      } else if (note.includes('reducido') || note.includes('inercia') || note.includes('extra') || (pot.calibrationCount && pot.calibrationCount > 0)) {
        reajusteEvent = {
          date: dateStr,
          type: 'dose_calibration',
          desc: note,
          note
        };
        reajustes.push(reajusteEvent);
      }

      currentMoisture = 100;
      theoreticalMoisture = 100;
    }

    // 3. Drenaje natural por evapotranspiración
    currentMoisture = Math.max(0, currentMoisture - dayDrainCalibrated);
    theoreticalMoisture = Math.max(0, theoreticalMoisture - dayDrainTheoretical);

    // 4. Lluvia natural absorbida (si no está bajo techo)
    let rainAbsorbed = 0;
    const rain = day.rainSum || 0;
    if (!isCovered && rain > 0) {
      if (rain >= soakRainThreshold) {
        currentMoisture = 100;
        theoreticalMoisture = 100;
        rainAbsorbed = rain;
      } else if (rain >= minEffectiveRain) {
        const recharge = Math.min(60, rain * 5);
        currentMoisture = Math.min(100, currentMoisture + recharge);
        theoreticalMoisture = Math.min(100, theoreticalMoisture + recharge);
        rainAbsorbed = rain;
      } else {
        const recharge = Math.min(25, rain * 3);
        currentMoisture = Math.min(100, currentMoisture + recharge);
        theoreticalMoisture = Math.min(100, theoreticalMoisture + recharge);
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
            note: 'Riego proyectado por modelo calibrado'
          };
        }
      }
    }

    if (isFuture && !nextTheoreticalProjectedDate && theoreticalMoisture <= moistureThreshold) {
      nextTheoreticalProjectedDate = dateStr;
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
      theoreticalMoisturePercent: Math.round(theoreticalMoisture),
      dayDrain: Math.round(dayDrainCalibrated * 10) / 10,
      dayDrainTheoretical: Math.round(dayDrainTheoretical * 10) / 10,
      moistureThreshold,
      isFrostDay,
      isFreezingDay,
      wateringEvent,
      reajusteEvent
    });
  }

  // Tasa media de evaporación diaria en el periodo
  const avgDrainDaily = daysResult.length > 0
    ? Math.round((daysResult.reduce((sum, d) => sum + d.dayDrain, 0) / daysResult.length) * 10) / 10
    : 10.0;

  return {
    days: daysResult,
    pot,
    reajustes,
    nextWateringExpected: nextWateringProjectedDate,
    nextTheoreticalExpected: nextTheoreticalProjectedDate,
    threshold: moistureThreshold,
    learnedFactor: Math.round(learnedFactor * 100) / 100,
    isCovered,
    factors: {
      plantDemand: plant.waterDemandFactor,
      plantLabel: plant.label,
      materialMultiplier: material.dryingMultiplier,
      materialLabel: material.label,
      sizeMultiplier: Math.round(sizeMultiplier * 100) / 100,
      containerDescription,
      sunMultiplier: sun.dryingMultiplier,
      sunLabel: sun.label,
      microclimateMultiplier: Math.round(microclimate.microclimateMultiplier * 100) / 100,
      learnedFactor: Math.round(learnedFactor * 100) / 100,
      avgDrainDaily,
      nominalIntervalDays: Math.round((baseInterval / theoreticalBaseDryingFactor) * 10) / 10,
      calibratedIntervalDays: Math.round((baseInterval / calibratedBaseDryingFactor) * 10) / 10
    },
    summary: {
      totalDays: daysResult.length,
      realWateringsCount: daysResult.filter(d => d.wateringEvent && d.wateringEvent.type === 'real').length,
      frostDaysCount: daysResult.filter(d => d.isFrostDay).length,
      reajustesCount: reajustes.length
    }
  };
}
