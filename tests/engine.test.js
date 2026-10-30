import { describe, it, expect } from 'vitest';
import {
  calculatePotWatering,
  analyzeWeatherRisks,
  calculateEnvironmentalEvaporation,
  PLANT_TYPES,
  POT_MATERIALS
} from '../src/engine/irrigationEngine.js';

describe('Motor de Riego Agronómico para Terraza y Macetas', () => {

  const baseWeather = {
    currentTemp: 22,
    minTemp: 14,
    maxTemp: 24,
    rainSum: 0,
    rainProb: 10,
    et0: 3.5
  };

  const now = new Date('2026-05-15T10:00:00Z');

  it('calcula correctamente riesgos de helada crítica (Tmin <= 0°C)', () => {
    const freezingWeather = {
      ...baseWeather,
      minTemp: -2,
      maxTemp: 6
    };

    const pot = {
      id: 'pot-1',
      name: 'Geranio Balconero',
      plantType: 'flowering',
      material: 'terracotta',
      size: 'medium',
      sunExposure: 'full_sun',
      isCovered: false,
      lastWatered: '2026-05-10T10:00:00Z' // 5 días sin regar
    };

    const result = calculatePotWatering(pot, freezingWeather, now);

    expect(result.status).toBe('frozen_hold');
    expect(result.actionTitle).toContain('SUSPENDER RIEGO');
    expect(result.weatherRisks.isFreezingTonight).toBe(true);
    expect(result.alertBadge?.type).toBe('frost-danger');
  });

  it('maceta de barro se seca notablemente más rápido que maceta de plástico', () => {
    const clayPot = {
      id: 'clay-1',
      name: 'Planta en Barro',
      plantType: 'flowering',
      material: 'terracotta',
      size: 'medium',
      sunExposure: 'partial_sun',
      isCovered: true,
      lastWatered: '2026-05-13T22:00:00Z' // ~1.5 días
    };

    const plasticPot = {
      ...clayPot,
      id: 'plastic-1',
      name: 'Planta en Plástico',
      material: 'plastic'
    };

    const resClay = calculatePotWatering(clayPot, baseWeather, now);
    const resPlastic = calculatePotWatering(plasticPot, baseWeather, now);

    // El intervalo en barro debe ser menor (se seca antes)
    expect(resClay.effectiveIntervalDays).toBeLessThan(resPlastic.effectiveIntervalDays);
    // Y la humedad restante en barro debe ser menor que en plástico
    expect(resClay.soilMoisturePercent).toBeLessThan(resPlastic.soilMoisturePercent);
  });

  it('diferencia entre balcón techado y balcón a cielo abierto ante lluvia', () => {
    const rainyWeather = {
      ...baseWeather,
      rainSum: 20 // 20 mm de lluvia
    };

    // Maceta que hace 4 días que no se riega
    const fourDaysAgo = new Date(now.getTime() - 4 * 86400000).toISOString();

    const openSkyPot = {
      id: 'open-1',
      name: 'Tomate Cielo Abierto',
      plantType: 'vegetable',
      material: 'plastic',
      size: 'large',
      sunExposure: 'full_sun',
      isCovered: false,
      lastWatered: fourDaysAgo
    };

    const coveredPot = {
      ...openSkyPot,
      id: 'covered-1',
      name: 'Tomate Balcón Techado',
      isCovered: true
    };

    const resOpen = calculatePotWatering(openSkyPot, rainyWeather, now);
    const resCovered = calculatePotWatering(coveredPot, rainyWeather, now);

    // A cielo abierto, la lluvia de 20mm recarga al 100%
    expect(resOpen.soilMoisturePercent).toBe(100);
    expect(resOpen.status).toBe('saturated');

    // Bajo techo, la lluvia exterior no penetra
    expect(resCovered.soilMoisturePercent).toBeLessThan(100);
    expect(resCovered.balconyNotice).toContain('bajo techo esta maceta NO se ha regado');
  });

  it('acelera el secado ante una ola de calor veraniega', () => {
    const heatwaveWeather = {
      ...baseWeather,
      minTemp: 24,
      maxTemp: 39,
      et0: 7.2
    };

    const evapNormal = calculateEnvironmentalEvaporation(baseWeather);
    const evapHeatwave = calculateEnvironmentalEvaporation(heatwaveWeather);

    expect(evapHeatwave).toBeGreaterThan(evapNormal * 1.3);

    const pot = {
      id: 'heat-pot',
      name: 'Margaritas',
      plantType: 'flowering',
      material: 'plastic',
      size: 'small',
      sunExposure: 'full_sun',
      isCovered: false,
      lastWatered: '2026-05-14T10:00:00Z' // 1 día
    };

    const resHeat = calculatePotWatering(pot, heatwaveWeather, now);
    expect(resHeat.bestTimeOfDay).toContain('Madrugada');
  });

  it('detecta necesidad de riego urgente si el sustrato baja del 20%', () => {
    const neglectedPot = {
      id: 'dry-pot',
      name: 'Albahaca sedienta',
      plantType: 'vegetable',
      material: 'terracotta',
      size: 'small',
      sunExposure: 'full_sun',
      isCovered: true,
      lastWatered: '2026-05-08T10:00:00Z' // 7 días bajo calor
    };

    const res = calculatePotWatering(neglectedPot, baseWeather, now);
    expect(res.soilMoisturePercent).toBeLessThanOrEqual(20);
    expect(res.status).toBe('urgent');
    expect(res.alertBadge?.type).toBe('urgent');
  });

  it('hereda la inercia térmica y propiedades de la jardinera corrida padre', () => {
    const individualSmallPot = {
      id: 'pot-solo',
      name: 'Tomatito individual',
      plantType: 'vegetable',
      material: 'plastic',
      size: 'small',
      sunExposure: 'full_sun',
      isCovered: false,
      lastWatered: '2026-05-14T10:00:00Z' // 1 día
    };

    const planterPlant = {
      id: 'pot-in-planter',
      name: 'Tomatito en jardinera compartida',
      plantType: 'vegetable',
      material: 'plastic',
      size: 'small',
      sunExposure: 'full_sun',
      isCovered: false,
      lastWatered: '2026-05-14T10:00:00Z',
      container: {
        id: 'container-1',
        name: 'Jardinera Corrida 50L',
        totalLiters: 50,
        sections: 2, // 25L por sección
        material: 'plastic',
        sunExposure: 'full_sun',
        isCovered: false
      }
    };

    const resSolo = calculatePotWatering(individualSmallPot, baseWeather, now);
    const resPlanter = calculatePotWatering(planterPlant, baseWeather, now);

    // El intervalo efectivo es mayor en la jardinera corrida (se seca más despacio)
    expect(resPlanter.effectiveIntervalDays).toBeGreaterThan(resSolo.effectiveIntervalDays);
    // La planta en jardinera retiene significativamente más humedad debido al volumen compartido
    expect(resPlanter.soilMoisturePercent).toBeGreaterThan(resSolo.soilMoisturePercent);
  });

  it('respeta la personalización manual de parámetros agronómicos y tipos de planta', () => {
    const pot = {
      id: 'custom-pot',
      name: 'Tomatito Adaptado',
      plantType: 'vegetable',
      material: 'plastic',
      size: 'medium',
      sunExposure: 'full_sun',
      isCovered: false,
      lastWatered: '2026-05-13T10:00:00Z'
    };

    // Sin custom settings
    const defaultRes = calculatePotWatering(pot, baseWeather, now);

    // Con custom settings que reducen la demanda hídrica a la mitad
    const customSettings = {
      plantTypes: {
        vegetable: { waterDemandFactor: 0.85 }
      },
      weatherThresholds: {
        frostDanger: 2.0 // Elevar umbral de helada a 2°C
      }
    };

    const customRes = calculatePotWatering(pot, baseWeather, now, customSettings);

    // El intervalo debe ser mayor porque la demanda se redujo
    expect(customRes.effectiveIntervalDays).toBeGreaterThan(defaultRes.effectiveIntervalDays);

    // Verificar nuevo umbral de helada
    const coldWeather = { ...baseWeather, minTemp: 1.5 };
    const riskDefault = analyzeWeatherRisks(coldWeather);
    const riskCustom = analyzeWeatherRisks(coldWeather, customSettings);

    expect(riskDefault.frostRisk).toBe('warning'); // 1.5°C por defecto es warning (<= 2.5) pero no danger (<= 0)
    expect(riskCustom.frostRisk).toBe('danger'); // con threshold custom (<= 2.0) se convierte en danger
  });

  it('aplica el balance hídrico histórico día a día con lluvias pasadas observadas', () => {
    const testNow = new Date('2026-05-15T12:00:00Z');
    const outdoorPot = {
      id: 'outdoor-pot-1',
      name: 'Geranio Balconero',
      plantType: 'flowering',
      material: 'plastic',
      size: 'medium',
      sunExposure: 'partial_sun',
      isCovered: false,
      lastWatered: '2026-05-11T12:00:00Z' // 4 días atrás
    };

    const coveredPot = {
      ...outdoorPot,
      id: 'covered-pot-1',
      isCovered: true
    };

    // Clima con histórico: el 2026-05-14 llovió 20 mm (ayer)
    const weatherWithHistory = {
      ...baseWeather,
      allDaysMap: {
        '2026-05-12': { date: '2026-05-12', maxTemp: 24, minTemp: 14, rainSum: 0, et0: 3.5 },
        '2026-05-13': { date: '2026-05-13', maxTemp: 22, minTemp: 13, rainSum: 0, et0: 3.0 },
        '2026-05-14': { date: '2026-05-14', maxTemp: 18, minTemp: 11, rainSum: 20, et0: 1.5 }, // Lluvia empapa ayer
        '2026-05-15': { date: '2026-05-15', maxTemp: 23, minTemp: 13, rainSum: 0, et0: 3.2 }
      }
    };

    const resOutdoor = calculatePotWatering(outdoorPot, weatherWithHistory, testNow);
    const resCovered = calculatePotWatering(coveredPot, weatherWithHistory, testNow);

    // La maceta al aire libre absorbió la lluvia de ayer y tiene humedad notable frente a la techada seca
    expect(resOutdoor.totalRainAbsorbed).toBeGreaterThanOrEqual(20);
    expect(resOutdoor.soilMoisturePercent).toBeGreaterThan(resCovered.soilMoisturePercent);
    expect(resOutdoor.soilMoisturePercent).toBeGreaterThan(40);
    expect(resCovered.soilMoisturePercent).toBeLessThan(20);
  });

  it('pospone el riego futuro si se prevén lluvias en macetas descubiertas', () => {
    const testNow = new Date('2026-05-15T12:00:00Z');
    const outdoorPot = {
      id: 'outdoor-future',
      name: 'Geranio exterior',
      plantType: 'flowering',
      material: 'plastic',
      size: 'medium',
      sunExposure: 'partial_sun',
      isCovered: false,
      lastWatered: '2026-05-14T08:00:00Z' // regada ayer mañana
    };

    const coveredPot = {
      ...outdoorPot,
      id: 'covered-future',
      isCovered: true
    };

    // Previsión de lluvia abundante para mañana (16 de mayo)
    const weatherWithFutureRain = {
      ...baseWeather,
      forecastDays: [
        { date: '2026-05-15', maxTemp: 24, minTemp: 14, rainSum: 0, et0: 3.5 },
        { date: '2026-05-16', maxTemp: 17, minTemp: 11, rainSum: 18, et0: 1.8 }, // Lluvia mañana
        { date: '2026-05-17', maxTemp: 20, minTemp: 12, rainSum: 0, et0: 2.8 }
      ]
    };

    const resOutdoor = calculatePotWatering(outdoorPot, weatherWithFutureRain, testNow);
    const resCovered = calculatePotWatering(coveredPot, weatherWithFutureRain, testNow);

    // La maceta descubierta proyecta que mañana se recargará con lluvia, posponiendo el riego
    expect(resOutdoor.futureRainPostponed).toBe(true);
    expect(resOutdoor.daysUntilWatering).toBeGreaterThan(resCovered.daysUntilWatering);
  });
});
