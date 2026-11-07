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
});

