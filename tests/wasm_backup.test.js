import { describe, it, expect } from 'vitest';
import { wasmEngineService } from '../src/services/wasmEngineService.js';
import { backupService } from '../src/services/backupService.js';

describe('Motor Go Wasm & Sistema de Copia de Seguridad', () => {
  const mockPot = {
    id: 'pot-test-wasm',
    name: 'Tomates Cherry Balcón',
    plantType: 'vegetable',
    material: 'terracotta',
    size: 'large',
    sunExposure: 'full_sun',
    isCovered: true,
    learnedDryingFactor: 1.0,
    calibratedDoseMl: 0,
    calibrationCount: 0
  };

  const mockWeather = {
    maxTemp: 28,
    minTemp: 16,
    avgTemp: 22,
    rainSum: 0,
    et0: 4.2
  };

  it('calcula la dosis recomendada en ml y vasos para maceta grande de terracota', async () => {
    const dose = await wasmEngineService.calculateDose(mockPot, mockWeather);

    expect(dose.doseMl).toBeGreaterThan(500);
    expect(dose.doseGlasses).toBeGreaterThanOrEqual(2.0);
    expect(dose.explanation).toContain('vaso');
  });

  it('el bucle de retroalimentación adapta el factor de secado si la planta se secó antes de tiempo', async () => {
    // Usuario comprueba a los 2 días y el dedo indica sequedad total (nivel 0)
    const feedback = {
      daysElapsed: 2.0,
      observedMoistureLevel: 0, // seco total
      waterGivenGlasses: 2.0,
      meanTempObserved: 29.0
    };

    const result = await wasmEngineService.calibrateWithFingerTest(mockPot, feedback);

    expect(result.success).toBe(true);
    // Debe haber incrementado el factor de secado (secado más rápido de lo esperado)
    expect(result.newLearnedDryingFactor).toBeGreaterThan(1.0);
    expect(result.calibrationCount).toBe(1);
    expect(result.message).toContain('Retroalimentación');
  });

  it('el servicio de backup inicializa métodos para exportar e importar datos', () => {
    expect(typeof backupService.exportFullBackup).toBe('function');
    expect(typeof backupService.importBackup).toBe('function');
  });

  it('calcula la dosis proporcional cuando la planta está asignada a una jardinera corrida', async () => {
    const potWithContainer = {
      ...mockPot,
      container: {
        id: 'container-test',
        name: 'Jardinera 60L',
        totalLiters: 60,
        sections: 3, // 20L efectivos por sección
        material: 'terracotta'
      }
    };

    const dose = await wasmEngineService.calculateDose(potWithContainer, mockWeather);
    // Con 20L efectivos de terracota frente a maceta mediana, la dosis debe ser robusta (>800ml)
    expect(dose.doseMl).toBeGreaterThan(800);
    expect(dose.doseGlasses).toBeGreaterThanOrEqual(3.0);
  });
});
