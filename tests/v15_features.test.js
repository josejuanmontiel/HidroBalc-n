import { describe, it, expect, beforeEach } from 'vitest';
import { db, Database, APP_VERSION } from '../src/storage/db.js';
import { photoDb } from '../src/storage/photoDb.js';

describe('HidroBalcón v1.5.0: Safety Snapshot, Demo Mode, Volúmenes y Fotos', () => {
  beforeEach(() => {
    // Reset to clean test state
    db.loadDemoData();
  });

  describe('Tarea 1 & 2: Modo Demo e Instantánea de Seguridad Automática (Enfoque B)', () => {
    it('genera una instantánea de seguridad automática cuando cambia la versión', () => {
      const testDb = new Database();
      testDb._setItem('riego_balcon_app_version', '1.4.0');
      testDb.init();

      const snapshot = testDb.getLatestSafetySnapshot();
      expect(snapshot).not.toBeNull();
      expect(snapshot.fromVersion).toBe('1.4.0');
      expect(snapshot.toVersion).toBe(APP_VERSION);
      expect(snapshot.potCount).toBeGreaterThan(0);
    });

    it('permite restaurar datos desde la instantánea de seguridad automática', () => {
      // 1. Guardar macetas iniciales
      const initialCount = db.getPots().length;
      db._createSafetySnapshotOnVersionChange('1.4.0', '1.5.0');

      // 2. Modificar/vaciar macetas
      db.clearDemoData();
      expect(db.getPots().length).toBe(0);

      // 3. Restaurar instantánea
      const result = db.restoreSafetySnapshot();
      expect(result.success).toBe(true);
      expect(result.potCount).toBe(initialCount);
      expect(db.getPots().length).toBe(initialCount);
    });

    it('clearDemoData vacía los datos y evita que init() vuelva a inyectar ejemplos', () => {
      db.clearDemoData();
      expect(db.getPots().length).toBe(0);
      expect(db.getContainers().length).toBe(0);
      expect(db.getZones().length).toBe(0);

      // Simular reinicio de la app
      db.init();
      expect(db.getPots().length).toBe(0);

      // Cargar de nuevo
      db.loadDemoData();
      expect(db.getPots().length).toBeGreaterThan(0);
    });
  });

  describe('Tarea 7: Volúmenes con decimales y macetas pequeñas (< 2L)', () => {
    it('permite registrar jardineras y macetas pequeñas de menos de 5L con decimales libres', () => {
      const container = db.addContainer({
        name: 'Macetita balcón 1.5L',
        material: 'plastic',
        totalLiters: 1.5,
        sections: 1
      });
      expect(container.totalLiters).toBe(1.5);
      const retrieved = db.getContainer(container.id);
      expect(retrieved.totalLiters).toBe(1.5);

      const smallPot = db.addPot({
        name: 'Cactus Mini',
        substrateLiters: 0.75,
        size: 'small',
        containerId: container.id
      });
      expect(smallPot.substrateLiters).toBe(0.75);
      expect(db.getPot(smallPot.id).substrateLiters).toBe(0.75);
    });
  });

  describe('Tarea 4 & 6: Fotos de Galería General, Asignación y Recorte', () => {
    it('permite guardar fotos independientes sin potId para la galería general', async () => {
      const photo = await photoDb.addPhoto({
        dataUrl: 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAkA4JYwCdAD4A/wA/v8AAP7/AP//8A',
        note: 'Foto paisaje balcón',
        tag: 'Galería general'
      });
      expect(photo).not.toBeNull();
      expect(photo.potId).toBeNull();

      const all = await photoDb.getAllPhotos();
      expect(all.some(p => p.id === photo.id)).toBe(true);
    });

    it('asigna una foto existente a una maceta destino', async () => {
      const photo = await photoDb.addPhoto({
        dataUrl: 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAkA4JYwCdAD4A/wA/v8AAP7/AP//8A',
        note: 'Foto suelta',
        tag: 'Vivero'
      });

      const pot = db.getPots()[0];
      const assigned = await photoDb.assignPhotoToPot(photo.id, pot.id, true);
      expect(assigned).toBe(true);

      const potPhotos = await photoDb.getPhotosByPot(pot.id);
      expect(potPhotos.some(p => p.id === photo.id)).toBe(true);
    });

    it('actualiza el dataUrl de una foto tras un recorte o rotación', async () => {
      const photo = await photoDb.addPhoto({
        potId: 'pot-crop-test',
        dataUrl: 'data:image/webp;base64,originalData',
        note: 'Antes del recorte'
      });

      const updated = await photoDb.updatePhotoDataUrl(photo.id, 'data:image/webp;base64,croppedData');
      expect(updated).toBe(true);

      const photos = await photoDb.getPhotosByPot('pot-crop-test');
      const found = photos.find(p => p.id === photo.id);
      expect(found.dataUrl).toBe('data:image/webp;base64,croppedData');
      expect(found.croppedAt).toBeDefined();
    });
  });

  describe('Telemetría histórica, recálculo por prueba del dedo y archivo climático offline', () => {
    it('db.recordFingerTest actualiza lastFingerTest, learnedDryingFactor y guarda un log estructurado', async () => {
      const { db } = await import('../src/storage/db.js');
      const prevPots = db.getPots();
      const prevLogs = db.getLogs();

      try {
        const pot = db.addPot({
          id: 'pot-finger-telemetry',
          name: 'Tomate Telemetría',
          potType: 'terracotta',
          diameterCm: 25,
          depthCm: 25,
          substrateType: 'universal',
          sunExposure: 'full_sun',
          plantType: 'vegetable',
          learnedDryingFactor: 1.0,
          lastWatered: '2026-11-08T10:00:00.000Z'
        });

        const weatherSnapshot = {
          currentTemp: 15,
          maxTemp: 18,
          minTemp: 11,
          rainSumToday: 0,
          et0: 2.1,
          past7DaysRainSum: 28.4,
          meanTempObserved: 14
        };

        const testDate = '2026-11-15T09:30:00.000Z';
        const recordResult = db.recordFingerTest(pot.id, {
          observedMoistureLevel: 3,
          observedMoisturePercent: 92,
          daysElapsed: 7,
          meanTempObserved: 14,
          estimatedMoistureBefore: 42,
          newLearnedDryingFactor: 0.85,
          newDoseMl: 450,
          newDoseGlasses: 1.8,
          calibrationCount: 1,
          weatherSnapshot,
          notes: 'Sustrato muy húmedo tras semana de lluvias',
          date: testDate
        });

        expect(recordResult).toBeDefined();

        const updatedPot = db.getPot(pot.id);
        expect(updatedPot.learnedDryingFactor).toBe(0.85);
        expect(updatedPot.lastFingerTest).toBeDefined();
        expect(updatedPot.lastFingerTest.date).toBe(testDate);
        expect(updatedPot.lastFingerTest.level).toBe(3);
        expect(updatedPot.lastFingerTest.moisturePercent).toBe(92);

        const logs = db.getLogs();
        const fingerLog = logs.find(l => l.potId === pot.id && l.type === 'finger_test');
        expect(fingerLog).toBeDefined();
        expect(fingerLog.moistureBefore).toBe(42);
        expect(fingerLog.moistureAfter).toBe(92);
        expect(fingerLog.learnedDryingFactorBefore).toBe(1.0);
        expect(fingerLog.learnedDryingFactorAfter).toBe(0.85);
        expect(fingerLog.weatherSnapshot).toEqual(weatherSnapshot);
      } finally {
        db.savePots(prevPots);
        db.saveLogs(prevLogs);
      }
    });

    it('calculatePotWatering ancla soilMoisturePercent a pot.lastFingerTest cuando es más reciente que lastWatered y recalcula estado', async () => {
      const { calculatePotWatering, FINGER_LEVEL_MOISTURE_MAP } = await import('../src/engine/irrigationEngine.js');

      const now = new Date('2026-11-15T10:00:00.000Z');
      const weatherData = {
        currentTemp: 17,
        maxTemp: 19,
        minTemp: 11,
        rainSum: 0,
        et0: 2.2,
        isUnderRoof: false,
        allDays: [
          { date: '2026-11-08', maxTemp: 17, minTemp: 10, rainSum: 0, rainProb: 10, et0: 2.3 },
          { date: '2026-11-09', maxTemp: 16, minTemp: 10, rainSum: 0, rainProb: 10, et0: 2.2 },
          { date: '2026-11-10', maxTemp: 16, minTemp: 10, rainSum: 0, rainProb: 10, et0: 2.2 },
          { date: '2026-11-11', maxTemp: 16, minTemp: 10, rainSum: 0, rainProb: 10, et0: 2.2 },
          { date: '2026-11-12', maxTemp: 16, minTemp: 10, rainSum: 0, rainProb: 10, et0: 2.2 },
          { date: '2026-11-13', maxTemp: 16, minTemp: 10, rainSum: 0, rainProb: 10, et0: 2.2 },
          { date: '2026-11-14', maxTemp: 17, minTemp: 11, rainSum: 0, rainProb: 10, et0: 2.2 },
          { date: '2026-11-15', maxTemp: 17, minTemp: 11, rainSum: 0, rainProb: 10, et0: 2.2 }
        ]
      };

      const basePot = {
        id: 'pot-anchor-test',
        name: 'Albahaca',
        potType: 'plastic',
        diameterCm: 20,
        depthCm: 20,
        substrateType: 'universal',
        sunExposure: 'partial_shade',
        plantType: 'herbs',
        isUnderRoof: true,
        lastWatered: '2026-11-08T08:00:00.000Z',
        learnedDryingFactor: 1.0
      };

      const beforeFinger = calculatePotWatering(basePot, weatherData, now, {});

      // Prueba del dedo hoy fija nivel 3 (92%) -> debería anclar humedad y retrasar riego
      const wetFingerPot = {
        ...basePot,
        lastFingerTest: {
          date: '2026-11-15T09:00:00.000Z',
          level: 3,
          observedMoisturePercent: FINGER_LEVEL_MOISTURE_MAP[3].moisturePercent
        }
      };

      const afterWetFinger = calculatePotWatering(wetFingerPot, weatherData, now, {});
      expect(afterWetFinger.anchoredToFingerTest).toBe(true);
      expect(afterWetFinger.soilMoisturePercent).toBeGreaterThanOrEqual(90);
      expect(afterWetFinger.soilMoisturePercent).toBeLessThanOrEqual(92);
      expect(afterWetFinger.daysUntilWatering).toBeGreaterThan(0);
      expect(afterWetFinger.status).toBe('saturated');

      // Prueba del dedo hoy fija nivel 0 (15%) -> debería anclar humedad baja y pedir riego urgente
      const dryFingerPot = {
        ...basePot,
        lastWatered: '2026-11-14T08:00:00.000Z',
        lastFingerTest: {
          date: '2026-11-15T09:00:00.000Z',
          level: 0,
          observedMoisturePercent: FINGER_LEVEL_MOISTURE_MAP[0].moisturePercent
        }
      };
      const afterDryFinger = calculatePotWatering(dryFingerPot, weatherData, now, {});
      expect(afterDryFinger.anchoredToFingerTest).toBe(true);
      expect(afterDryFinger.soilMoisturePercent).toBeLessThanOrEqual(15);
      expect(afterDryFinger.daysUntilWatering).toBe(0);
      expect(afterDryFinger.status).not.toBe('optimal');
      expect(beforeFinger.anchoredToFingerTest).toBe(false);
    });

    it('db.mergeWeatherDays persiste >7 días y backupService exporta e importa weatherHistory', async () => {
      const { db } = await import('../src/storage/db.js');
      const { backupService } = await import('../src/services/backupService.js');

      const prevHistory = db.getWeatherHistory();
      const origDocument = globalThis.document;
      const origFileReader = globalThis.FileReader;
      const origCreateObjectURL = globalThis.URL?.createObjectURL;
      const origRevokeObjectURL = globalThis.URL?.revokeObjectURL;

      try {
        db.saveWeatherHistory({});
        const tenDays = [];
        for (let i = 1; i <= 10; i++) {
          const day = String(i).padStart(2, '0');
          tenDays.push({
            date: `2026-11-${day}`,
            maxTemp: 15 + (i % 4),
            minTemp: 9 + (i % 3),
            rainSum: i <= 5 ? 4.2 : 0,
            rainProb: i <= 5 ? 80 : 10,
            et0: 2.0
          });
        }

        const mergedMap = db.mergeWeatherDays(tenDays, 'Madrid');
        expect(Object.keys(mergedMap)).toHaveLength(10);

        const list = db.getWeatherHistoryList();
        expect(list.length).toBeGreaterThanOrEqual(10);
        expect(list.some(d => d.date === '2026-11-01')).toBe(true);
        expect(list.some(d => d.date === '2026-11-10')).toBe(true);

        let capturedBlob = null;
        globalThis.document = {
          createElement: () => ({ href: '', download: '', click: () => {}, style: {} }),
          body: { appendChild: () => {}, removeChild: () => {} }
        };
        globalThis.URL.createObjectURL = (blob) => {
          capturedBlob = blob;
          return 'blob:mock';
        };
        globalThis.URL.revokeObjectURL = () => {};
        globalThis.FileReader = class {
          readAsText(input) {
            Promise.resolve().then(() => {
              if (this.onload) {
                this.onload({ target: { result: typeof input === 'string' ? input : JSON.stringify(input) } });
              }
            });
          }
        };

        const exported = await backupService.exportFullBackup();
        expect(exported.weatherDaysCount).toBe(10);
        expect(capturedBlob).not.toBeNull();

        const exportedJson = await capturedBlob.text();
        const parsedPayload = JSON.parse(exportedJson);
        expect(parsedPayload.data.weatherHistory).toBeDefined();
        expect(Object.keys(parsedPayload.data.weatherHistory)).toHaveLength(10);

        // Limpiar historial e importar de nuevo
        db.saveWeatherHistory({});
        expect(db.getWeatherHistoryList().length).toBe(0);

        const importResult = await backupService.importBackup(exportedJson);
        expect(importResult.success).toBe(true);
        expect(importResult.weatherDaysCount).toBe(10);
        expect(db.getWeatherHistoryList().length).toBe(10);
      } finally {
        globalThis.document = origDocument;
        globalThis.FileReader = origFileReader;
        if (globalThis.URL) {
          globalThis.URL.createObjectURL = origCreateObjectURL;
          globalThis.URL.revokeObjectURL = origRevokeObjectURL;
        }
        db.saveWeatherHistory(prevHistory);
      }
    });

    it('generatePotAnalyticsTimeline procesa logs finger_test, ajusta humedad y añade finger_calibration en reajustes', async () => {
      const { generatePotAnalyticsTimeline } = await import('../src/services/analyticsService.js');

      const pot = {
        id: 'pot-analytics-finger',
        name: 'Romero',
        potType: 'terracotta',
        diameterCm: 22,
        depthCm: 22,
        substrateType: 'universal',
        sunExposure: 'full_sun',
        plantType: 'herbs',
        lastWatered: '2026-11-10T10:00:00.000Z',
        learnedDryingFactor: 0.9
      };

      const historicalDays = [
        { date: '2026-11-11', maxTemp: 16, minTemp: 10, rainSum: 5, rainProb: 70, et0: 2.0 },
        { date: '2026-11-12', maxTemp: 17, minTemp: 10, rainSum: 0, rainProb: 10, et0: 2.1 }
      ];
      const forecastDays = [
        { date: '2026-11-13', maxTemp: 17, minTemp: 10, rainSum: 0, rainProb: 10, et0: 2.1 },
        { date: '2026-11-14', maxTemp: 18, minTemp: 11, rainSum: 0, rainProb: 10, et0: 2.2 },
        { date: '2026-11-15', maxTemp: 18, minTemp: 11, rainSum: 0, rainProb: 10, et0: 2.2 }
      ];
      const weatherData = {
        currentTemp: 16,
        maxTemp: 18,
        minTemp: 10,
        rainSum: 0,
        et0: 2.1,
        historicalDays,
        forecastDays,
        allDays: [...historicalDays, ...forecastDays]
      };

      const logs = [
        {
          id: 'log-finger-1',
          potId: pot.id,
          potName: pot.name,
          type: 'finger_test',
          date: '2026-11-13T09:00:00.000Z',
          observedMoistureLevel: 3,
          moistureBefore: 58,
          moistureAfter: 92,
          learnedDryingFactorBefore: 1.0,
          learnedDryingFactorAfter: 0.9,
          notes: 'Prueba del dedo tras lluvias',
          weatherSnapshot: {
            past7DaysRainSum: 19.5,
            meanTempObserved: 14,
            currentTemp: 16
          }
        }
      ];

      const timeline = generatePotAnalyticsTimeline(pot, weatherData, {}, logs);
      expect(timeline.summary.fingerTestsCount).toBe(1);

      const fingerDay = timeline.days.find(d => d.date === '2026-11-13');
      expect(fingerDay).toBeDefined();
      expect(fingerDay.moisturePercent).toBe(92);

      const calibEvent = timeline.reajustes.find(r => r.type === 'finger_calibration' && r.date === '2026-11-13');
      expect(calibEvent).toBeDefined();
      expect(calibEvent.moistureAfter).toBe(92);
      expect(calibEvent.weatherSnapshot).toBeDefined();
    });
  });
});

