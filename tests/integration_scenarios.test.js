import { describe, it, expect } from 'vitest';
import { SIMULATION_SCENARIOS } from '../src/services/simulatorService.js';
import { calculatePotWatering, analyzeWeatherRisks } from '../src/engine/irrigationEngine.js';

describe('Pruebas de Integración con Casos Sintéticos / Inventados', () => {
  const pots = [
    {
      id: 'pot-tomates',
      name: 'Tomates Cherry',
      plantType: 'vegetable',
      material: 'plastic',
      size: 'large',
      sunExposure: 'full_sun',
      isCovered: false, // al aire libre
      lastWatered: new Date(Date.now() - 86400000 * 2).toISOString()
    },
    {
      id: 'pot-geranio',
      name: 'Geranio Balconero',
      plantType: 'flowering',
      material: 'terracotta',
      size: 'medium',
      sunExposure: 'full_sun',
      isCovered: true, // bajo techo
      lastWatered: new Date(Date.now() - 86400000 * 2).toISOString()
    },
    {
      id: 'pot-suculentas',
      name: 'Suculentas',
      plantType: 'succulent_cactus',
      material: 'terracotta',
      size: 'small',
      sunExposure: 'full_sun',
      isCovered: true,
      lastWatered: new Date(Date.now() - 86400000 * 10).toISOString()
    }
  ];

  it('Caso 1: Ola de Calor Veraniega (39°C) acelera el secado y recomienda riego al amanecer', () => {
    const heatwave = SIMULATION_SCENARIOS.HEATWAVE_SUMMER.data;
    const risks = analyzeWeatherRisks(heatwave);

    expect(risks.isHeatwave).toBe(true);
    expect(risks.heatRisk).toBe('extreme');

    const resultTomates = calculatePotWatering(pots[0], heatwave);
    expect(resultTomates.bestTimeOfDay).toContain('Madrugada');
    expect(resultTomates.status).toMatch(/urgent|due/);
  });

  it('Caso 2: Helada Negra Nocturna (-2.5°C) activa suspensión total de riego en todas las macetas', () => {
    const frost = SIMULATION_SCENARIOS.FROST_WINTER.data;
    const risks = analyzeWeatherRisks(frost);

    expect(risks.isFreezingTonight).toBe(true);
    expect(risks.frostRisk).toBe('danger');

    // Incluso si una planta llevara 5 días sin regar, ante helada se debe suspender
    pots.forEach(pot => {
      const res = calculatePotWatering(pot, frost);
      expect(res.status).toBe('frozen_hold');
      expect(res.actionTitle).toContain('SUSPENDER RIEGO');
      expect(res.alertBadge?.type).toBe('frost-danger');
    });
  });

  it('Caso 3: Temporal de Lluvia (26mm) diferencia maceta techada de maceta a cielo abierto', () => {
    const storm = SIMULATION_SCENARIOS.RAIN_STORM_AUTUMN.data;

    const resOpenSky = calculatePotWatering(pots[0], storm);
    const resCovered = calculatePotWatering(pots[1], storm);

    // Maceta a cielo abierto se satura con la lluvia
    expect(resOpenSky.soilMoisturePercent).toBe(100);
    expect(resOpenSky.status).toBe('saturated');

    // Maceta bajo techo NO recibe el agua y advierte al usuario
    expect(resCovered.soilMoisturePercent).toBeLessThan(100);
    expect(resCovered.balconyNotice).toContain('bajo techo esta maceta NO se ha regado');
  });

  it('Caso 4: Escarcha limítrofe (1.8°C) advierte regar solo a mediodía', () => {
    const warning = SIMULATION_SCENARIOS.FROST_WARNING.data;
    const risks = analyzeWeatherRisks(warning);

    expect(risks.isFrostPossible).toBe(true);
    expect(risks.frostRisk).toBe('warning');

    const res = calculatePotWatering(pots[0], warning);
    expect(res.bestTimeOfDay).toContain('Mediodía');
  });
});
