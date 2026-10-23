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
});
