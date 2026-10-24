import { describe, it, expect } from 'vitest';
import { PhotoDatabase } from '../src/storage/photoDb.js';

describe('Gestor de Fotos e Historial de Evolución (IndexedDB)', () => {
  it('inicializa correctamente la clase PhotoDatabase sin arrojar errores en entornos sin browser', () => {
    const pDb = new PhotoDatabase();
    expect(pDb).toBeDefined();
    expect(typeof pDb.addPhoto).toBe('function');
    expect(typeof pDb.getPhotosByPot).toBe('function');
    expect(typeof pDb.getInitialPhoto).toBe('function');
    expect(typeof pDb.setInitialPhoto).toBe('function');
    expect(typeof pDb.setCoverPhoto).toBe('function');
    expect(typeof pDb.updatePhoto).toBe('function');
    expect(typeof pDb.compressImage).toBe('function');
  });

  it('devuelve array vacío de fotos si indexedDB no está disponible en entorno de prueba Node', async () => {
    const pDb = new PhotoDatabase();
    const photos = await pDb.getPhotosByPot('pot-test-1');
    expect(Array.isArray(photos)).toBe(true);
    expect(photos.length).toBe(0);

    const initial = await pDb.getInitialPhoto('pot-test-1');
    expect(initial).toBeNull();

    const updateRes = await pDb.updatePhoto('fake-id', { note: 'test' });
    expect(updateRes).toBe(false);

    const toggleRes = await pDb.toggleInstructionPhoto('fake-id');
    expect(toggleRes).toBe(false);
  });
});
