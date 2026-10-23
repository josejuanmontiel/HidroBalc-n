/**
 * Motor de Cálculo Agronómico para Riego en Balcón y Terraza
 * Modela el secado del sustrato en macetas teniendo en cuenta:
 * - Material de maceta (barro/plástico/cerámica/tela)
 * - Tamaño de maceta y volumen de sustrato
 * - Especie botánica y demanda hídrica
 * - Exposición solar (sol directo, semisombra, sombra)
 * - Ubicación (bajo techo vs al aire libre)
 * - Previsiones meteorológicas: Lluvia, Temperatura y Alertas de Helada (Open-Meteo)
 */

export const PLANT_TYPES = {
  succulent_cactus: {
    id: 'succulent_cactus',
    label: 'Cactus y Suculentas',
    icon: '🌵',
    waterDemandFactor: 0.35,
    minDaysBetweenWatering: 7,
    maxDaysBetweenWatering: 25,
    frostSensitivity: 'high' // muy vulnerables a heladas si están mojadas
  },
  aromatic_woody: {
    id: 'aromatic_woody',
    label: 'Aromáticas leñosas (Romero, Tomillo, Lavanda)',
    icon: '🌿',
    waterDemandFactor: 0.6,
    minDaysBetweenWatering: 4,
    maxDaysBetweenWatering: 12,
    frostSensitivity: 'low'
  },
  citrus: {
    id: 'citrus',
    label: 'Cítricos (Limonero, Kumquat, Naranjo)',
    icon: '🍋',
    waterDemandFactor: 1.15,
    minDaysBetweenWatering: 2,
    maxDaysBetweenWatering: 7,
    frostSensitivity: 'high'
  },
  flowering: {
    id: 'flowering',
    label: 'Flores y Balconeras (Geranios, Petunias, Gitanillas)',
    icon: '🌸',
    waterDemandFactor: 1.35,
    minDaysBetweenWatering: 2,
    maxDaysBetweenWatering: 6,
    frostSensitivity: 'medium'
  },
  vegetable: {
    id: 'vegetable',
    label: 'Huerto en maceta (Tomate Cherry, Pimientos, Albahaca)',
    icon: '🍅',
    waterDemandFactor: 1.75,
    minDaysBetweenWatering: 1,
    maxDaysBetweenWatering: 4,
    frostSensitivity: 'high'
  },
  foliage: {
    id: 'foliage',
    label: 'Plantas de Hoja Verde / Ficus / Helechos',
    icon: '🪴',
    waterDemandFactor: 1.0,
    minDaysBetweenWatering: 3,
    maxDaysBetweenWatering: 8,
    frostSensitivity: 'medium'
  }
};

export const POT_MATERIALS = {
  terracotta: {
    id: 'terracotta',
    label: 'Barro cocido / Terracota (Porosa)',
    dryingMultiplier: 1.65,
    frostVulnerability: 'alta (el agua en las paredes de barro se expande al helar y rompe la maceta)'
  },
  plastic: {
    id: 'plastic',
    label: 'Plástico o Resina (No poroso)',
    dryingMultiplier: 1.0,
    frostVulnerability: 'media'
  },
  ceramic: {
    id: 'ceramic',
    label: 'Cerámica esmaltada',
    dryingMultiplier: 1.05,
    frostVulnerability: 'media-alta'
  },
  fabric: {
    id: 'fabric',
    label: 'Geotextil / Maceta de tela',
    dryingMultiplier: 1.9,
    frostVulnerability: 'media'
  }
};

export const POT_SIZES = {
  small: {
    id: 'small',
    label: 'Pequeña (< 15 cm / < 2L)',
    dryingMultiplier: 1.7,
    rootInsulation: 'mínima (se enfría y calienta rapidísimo)'
  },
  medium: {
    id: 'medium',
    label: 'Mediana (15 - 25 cm / 2L a 8L)',
    dryingMultiplier: 1.15,
    rootInsulation: 'moderada'
  },
  large: {
    id: 'large',
    label: 'Grande (25 - 40 cm / 8L a 25L)',
    dryingMultiplier: 0.8,
    rootInsulation: 'buena'
  },
  planter: {
    id: 'planter',
    label: 'Jardinera corrida (> 40 cm / > 25L)',
    dryingMultiplier: 0.65,
    rootInsulation: 'alta'
  }
};

export const SUN_EXPOSURES = {
  full_sun: {
    id: 'full_sun',
    label: 'Pleno Sol (> 5h sol directo)',
    dryingMultiplier: 1.45
  },
  partial_sun: {
    id: 'partial_sun',
    label: 'Semisombra (2 - 5h sol)',
    dryingMultiplier: 1.0
  },
  shade: {
    id: 'shade',
    label: 'Sombra Luminosa (< 2h sol)',
    dryingMultiplier: 0.7
  }
};

/**
 * Evalúa los riesgos climáticos para el día actual y previsión próxima
 */
export function analyzeWeatherRisks(weatherData) {
  const currentTemp = weatherData?.currentTemp ?? 20;
  const minTemp = weatherData?.minTemp ?? 15;
  const maxTemp = weatherData?.maxTemp ?? 25;
  const rainSum = weatherData?.rainSum ?? 0;
  const rainProb = weatherData?.rainProb ?? 0;
  const et0 = weatherData?.et0 ?? 3.5;

  let frostRisk = 'none'; // 'none' | 'warning' | 'danger'
  let heatRisk = 'none';  // 'none' | 'moderate' | 'extreme'

  // Regla de helada
  if (minTemp <= 0) {
    frostRisk = 'danger';
  } else if (minTemp <= 2.5) {
    frostRisk = 'warning';
  }

  // Regla de ola de calor
  if (maxTemp >= 36) {
    heatRisk = 'extreme';
  } else if (maxTemp >= 31) {
    heatRisk = 'moderate';
  }

  return {
    currentTemp,
    minTemp,
    maxTemp,
    rainSum,
    rainProb,
    et0,
    frostRisk,
    heatRisk,
    isFreezingTonight: frostRisk === 'danger',
    isFrostPossible: frostRisk === 'warning',
    isHeatwave: heatRisk !== 'none'
  };
}

/**
 * Calcula el multiplicador de evaporación ambiental a partir de la temperatura y ET0
 */
export function calculateEnvironmentalEvaporation(weather) {
  const risks = analyzeWeatherRisks(weather);
  const maxT = risks.maxTemp;
  const et0 = risks.et0;

  // Base de secado diario según temperatura máxima
  let tempFactor = 1.0;
  if (maxT >= 38) tempFactor = 1.7;
  else if (maxT >= 33) tempFactor = 1.4;
  else if (maxT >= 28) tempFactor = 1.2;
  else if (maxT >= 20) tempFactor = 1.0;
  else if (maxT >= 14) tempFactor = 0.75;
  else if (maxT >= 8) tempFactor = 0.55;
  else tempFactor = 0.4;

  // Si hay ET0 (evapotranspiración FAO-56), normalizar con referencia 3.5 mm/día
  const et0Factor = et0 ? Math.max(0.4, Math.min(2.0, et0 / 3.5)) : 1.0;

  return tempFactor * 0.7 + et0Factor * 0.3;
}

/**
 * Calcula el estado hídrico y recomendación de riego para una maceta específica
 * @param {Object} pot - Datos de la maceta
 * @param {Object} weather - Datos del clima actual/previsto
 * @param {Date|string} now - Fecha y hora actual
 */
export function calculatePotWatering(pot, weather, now = new Date()) {
  const currentDate = new Date(now);
  const lastWateredDate = pot.lastWatered ? new Date(pot.lastWatered) : new Date(currentDate.getTime() - 86400000 * 2);
  
  // Días transcurridos desde el último riego
  const diffMs = currentDate.getTime() - lastWateredDate.getTime();
  const daysSince = Math.max(0, diffMs / (1000 * 60 * 60 * 24));

  const plant = PLANT_TYPES[pot.plantType] || PLANT_TYPES.foliage;
  const material = POT_MATERIALS[pot.material] || POT_MATERIALS.terracotta;
  const size = POT_SIZES[pot.size] || POT_SIZES.medium;
  const sun = SUN_EXPOSURES[pot.sunExposure] || SUN_EXPOSURES.partial_sun;
  const isCovered = Boolean(pot.isCovered); // Balcón techado

  const risks = analyzeWeatherRisks(weather);
  const envFactor = calculateEnvironmentalEvaporation(weather);

  // Tasa de secado compuesta
  // Una maceta pequeña de barro al sol con calor se seca x3 más rápido que una jardinera plástica a la sombra
  const compositeDryingRate = (
    plant.waterDemandFactor *
    material.dryingMultiplier *
    size.dryingMultiplier *
    sun.dryingMultiplier *
    envFactor
  );

  // Intervalo de riego nominal para esta maceta en estas condiciones (en días)
  const baseInterval = (plant.minDaysBetweenWatering + plant.maxDaysBetweenWatering) / 2;
  const effectiveIntervalDays = Math.max(0.8, baseInterval / compositeDryingRate);

  // Estimación de pérdida hídrica base (%)
  let soilMoisturePercent = Math.max(0, Math.min(100, Math.round(100 - (daysSince / effectiveIntervalDays) * 100)));

  // Impacto de la lluvia
  let rainImpact = 0;
  if (!isCovered && risks.rainSum > 0) {
    if (risks.rainSum >= 15) {
      // Lluvia copiosa al aire libre empapa el sustrato
      soilMoisturePercent = 100;
      rainImpact = risks.rainSum;
    } else if (risks.rainSum >= 4) {
      // Lluvia media recarga entre 30% y 60%
      const recharge = Math.min(60, risks.rainSum * 5);
      soilMoisturePercent = Math.min(100, soilMoisturePercent + recharge);
      rainImpact = risks.rainSum;
    }
  }

  // Días restantes hasta requerir riego (humedad umbral ~ 30%)
  const moistureReserve = Math.max(0, soilMoisturePercent - 30);
  const dailyDrain = 100 / effectiveIntervalDays;
  const daysUntilWatering = Math.round((moistureReserve / dailyDrain) * 10) / 10;

  // Fecha recomendada para el próximo riego
  const nextWaterDate = new Date(currentDate.getTime() + Math.max(0, daysUntilWatering) * 86400000);

  // Determinación de la mejor hora del día
  let bestTimeOfDay = 'Primera hora de la mañana (07:00 - 09:00)';
  if (risks.heatRisk !== 'none') {
    bestTimeOfDay = 'Madrugada / Muy temprano (06:30 - 08:00) para evitar que el calor evapore el agua o caliente las raíces';
  } else if (risks.minTemp < 10) {
    bestTimeOfDay = 'Mediodía (12:00 - 14:00) para que el agua no se enfríe de noche en las raíces';
  }

  // Determinación del Estado y Alertas
  let status = 'good'; // 'frozen_hold' | 'urgent' | 'due' | 'good' | 'saturated'
  let actionTitle = 'Humedad adecuada';
  let actionDescription = `Próximo riego estimado en ${Math.ceil(daysUntilWatering)} día(s).`;
  let alertBadge = null;

  // REGLA CRÍTICA DE HELADA:
  if (risks.isFreezingTonight) {
    status = 'frozen_hold';
    actionTitle = '🚫 SUSPENDER RIEGO: Helada Inminente';
    actionDescription = `Se prevén ${risks.minTemp}°C esta noche. Regar ahora congelaría el cepellón de la maceta y rompería las raíces. Si puedes, arrima la maceta a la pared o protégela con manta térmica.`;
    alertBadge = {
      type: 'frost-danger',
      label: `Alerta Helada (${risks.minTemp}°C)`,
      color: '#0284c7'
    };
  } else if (risks.isFrostPossible && soilMoisturePercent <= 30) {
    // Alerta de escarcha pero la planta tiene mucha sed
    status = 'due';
    actionTitle = '⚠️ Precaución por frío (Riego sólo al mediodía)';
    actionDescription = `Mínima prevista de ${risks.minTemp}°C. Si riegas, hazlo exclusivamente en las horas de sol central (13:00) y con poca agua tibia para que no duerma encharcada.`;
    alertBadge = {
      type: 'frost-warning',
      label: `Riesgo Escarcha (${risks.minTemp}°C)`,
      color: '#38bdf8'
    };
  } else if (soilMoisturePercent <= 20) {
    status = 'urgent';
    actionTitle = '💧 Riego Urgente';
    actionDescription = `El sustrato está prácticamente seco (${soilMoisturePercent}%). Conviene regar hoy (${bestTimeOfDay}).`;
    alertBadge = {
      type: 'urgent',
      label: 'Sustrato Seco',
      color: '#ef4444'
    };
  } else if (soilMoisturePercent <= 40) {
    status = 'due';
    actionTitle = 'Regar pronto';
    actionDescription = `Nivel de humedad al ${soilMoisturePercent}%. Riego recomendado para ${daysUntilWatering <= 0 ? 'hoy' : 'mañana'}.`;
    alertBadge = {
      type: 'due',
      label: 'Riego Próximo',
      color: '#f59e0b'
    };
  } else if (soilMoisturePercent >= 85) {
    status = 'saturated';
    actionTitle = 'Sustrato húmedo / recién regado';
    actionDescription = isCovered
      ? 'La tierra tiene reserva de agua suficiente.'
      : (rainImpact > 0 ? `Regada de forma natural por la lluvia exterior (${rainImpact} mm).` : 'La tierra tiene reserva de agua suficiente.');
  }

  // Notificación particular sobre terraza techada vs lluvia
  let balconyNotice = null;
  if (isCovered && risks.rainSum >= 5) {
    balconyNotice = `🌧️ Ojo: Fuera caen ${risks.rainSum} mm de lluvia, pero al estar bajo techo esta maceta NO se ha regado.`;
  }

  return {
    potId: pot.id,
    potName: pot.name,
    plantType: plant,
    material,
    size,
    sun,
    isCovered,
    daysSinceLastWatered: Math.round(daysSince * 10) / 10,
    effectiveIntervalDays: Math.round(effectiveIntervalDays * 10) / 10,
    soilMoisturePercent,
    status,
    actionTitle,
    actionDescription,
    bestTimeOfDay,
    nextWaterDate,
    daysUntilWatering,
    alertBadge,
    balconyNotice,
    weatherRisks: risks
  };
}
