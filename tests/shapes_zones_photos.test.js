import { describe, it, expect } from 'vitest';
import {
  POT_SHAPES,
  BALCONY_ORIENTATIONS,
  SHADE_FACTORS,
  calculateOrientationAndShadowFactor,
  calculatePotWatering
} from '../src/engine/irrigationEngine.js';
import { db } from '../src/storage/db.js';
import { PhotoDatabase } from '../src/storage/photoDb.js';

describe('Nuevas funcionalidades: Macetas Redondas, Zonas de Terraza y Orientación', () => {
  it('calcula el volumen exacto de maceta redonda / cilíndrica mediante V = pi * r^2 * h', () => {
    // Maceta redonda estándar: diámetro 20 cm (radio 10 cm), altura 20 cm
    // V = pi * 10^2 * 20 = pi * 2000 = 6283.18 cm^3 = ~6.3 L
    const roundShape = POT_SHAPES.round;
    const liters = roundShape.calculateLiters(20, 20);
    expect(liters).toBeCloseTo(6.3, 1);

    // Jardinera o maceta cuadrada: 30x20x20 = 12000 cm^3 = 12.0 L
    const rectShape = POT_SHAPES.rectangular;
    const rectLiters = rectShape.calculateLiters(30, 20, 20);
    expect(rectLiters).toBe(12.0);
  });

  it('calcula correctamente las horas estimadas de sol y factor de microclima según orientación y sombras', () => {
    // Sur a pleno sol sin sombra
    const southSunny = calculateOrientationAndShadowFactor({
      orientation: 'south',
      shadow: 'none',
      baseExposure: 'full_sun'
    });
    expect(southSunny.estimatedSunHours).toBeGreaterThanOrEqual(8.0);
    expect(southSunny.microclimateMultiplier).toBeGreaterThan(1.1);

    // Norte con sombra de edificio enfrente
    const northShaded = calculateOrientationAndShadowFactor({
      orientation: 'north',
      shadow: 'partial_building',
      baseExposure: 'shade'
    });
    expect(northShaded.estimatedSunHours).toBeLessThanOrEqual(2.0);
    expect(northShaded.microclimateMultiplier).toBeLessThan(0.7);
  });

  it('el motor agronómico calcula secado más rápido en zona Sur vs zona Norte', () => {
    const baseWeather = {
      currentTemp: 22,
      minTemp: 14,
      maxTemp: 26,
      rainSum: 0,
      rainProb: 0,
      et0: 4.0
    };
    const now = new Date('2026-06-15T12:00:00Z');

    const potSouth = {
      id: 'pot-south',
      name: 'Petunia Balcón Sur',
      plantType: 'flowering',
      material: 'plastic',
      size: 'medium',
      sunExposure: 'full_sun',
      orientation: 'south',
      shadow: 'none',
      lastWatered: new Date('2026-06-13T12:00:00Z').toISOString()
    };

    const potNorth = {
      ...potSouth,
      id: 'pot-north',
      name: 'Petunia Rincón Norte',
      orientation: 'north',
      shadow: 'partial_building'
    };

    const resSouth = calculatePotWatering(potSouth, baseWeather, now);
    const resNorth = calculatePotWatering(potNorth, baseWeather, now);

    // Al sur se seca más rápido: menor intervalo de días y menor humedad restante
    expect(resSouth.effectiveIntervalDays).toBeLessThan(resNorth.effectiveIntervalDays);
    expect(resSouth.soilMoisturePercent).toBeLessThan(resNorth.soilMoisturePercent);
    expect(resSouth.microclimate).toBeDefined();
    expect(resSouth.microclimate.estimatedSunHours).toBeGreaterThan(resNorth.microclimate.estimatedSunHours);
  });

  it('persiste y gestiona Zonas de Terraza en LocalStorage DB', () => {
    const zones = db.getZones();
    expect(Array.isArray(zones)).toBe(true);
    expect(zones.length).toBeGreaterThanOrEqual(2);

    const newZone = db.addZone({
      name: 'Zona Nueva Terraza Poniente',
      orientation: 'west',
      shadow: 'awning',
      isCovered: true
    });
    expect(newZone.id).toBeTruthy();
    expect(db.getZone(newZone.id)?.name).toBe('Zona Nueva Terraza Poniente');

    db.updateZone(newZone.id, { name: 'Zona Poniente Actualizada' });
    expect(db.getZone(newZone.id)?.name).toBe('Zona Poniente Actualizada');

    db.deleteZone(newZone.id);
    expect(db.getZone(newZone.id)).toBeUndefined();
  });

  it('PhotoDatabase incluye soporte para getAllPhotos, copyPhotoToPots y movePhotoToPot sin romper en Node', async () => {
    const pDb = new PhotoDatabase();
    expect(typeof pDb.getAllPhotos).toBe('function');
    expect(typeof pDb.copyPhotoToPots).toBe('function');
    expect(typeof pDb.movePhotoToPot).toBe('function');

    const all = await pDb.getAllPhotos();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBe(0);

    const copyRes = await pDb.copyPhotoToPots('photo-fake', ['pot-target']);
    expect(copyRes).toBe(false);

    const moveRes = await pDb.movePhotoToPot('photo-fake', 'pot-target');
    expect(moveRes).toBe(false);
  });

  it('guarda y actualiza nombres propios de maceta manteniendo el enlace con la ficha de la especie en BD', () => {
    const customPot = db.addPot({
      name: 'Tomatito Cherry de mi Abuela',
      speciesId: 'tomate_cherry',
      importSource: 'Catálogo de España 100',
      plantType: 'vegetable',
      material: 'terracotta',
      shape: 'round',
      dimensions: { diameter: 25, height: 25 },
      substrateLiters: 12.3,
      size: 'medium',
      sunExposure: 'full_sun',
      isCovered: false
    });

    expect(customPot.name).toBe('Tomatito Cherry de mi Abuela');
    expect(customPot.speciesId).toBe('tomate_cherry');
    expect(customPot.importSource).toContain('Catálogo');
    expect(customPot.shape).toBe('round');
    expect(customPot.substrateLiters).toBe(12.3);

    // Actualizar nombre
    const updated = db.updatePot(customPot.id, { name: 'Super Cherry Balconero' });
    expect(updated.name).toBe('Super Cherry Balconero');
    // El enlace botánico se conserva intacto
    expect(updated.speciesId).toBe('tomate_cherry');
  });

  it('permite añadir y desvincular múltiples plantas a una misma jardinera multiespecie', () => {
    const jardinera = db.addContainer({
      name: 'Jardinera Aromáticas 60cm',
      totalLiters: 30,
      sections: 3,
      material: 'terracotta',
      sunExposure: 'full_sun',
      isCovered: true
    });

    const planta1 = db.addPot({ name: 'Romero', containerId: jardinera.id, plantType: 'aromatic_woody' });
    const planta2 = db.addPot({ name: 'Tomillo', containerId: jardinera.id, plantType: 'aromatic_woody' });

    let pots = db.getPots();
    const inJardinera = pots.filter(p => p.containerId === jardinera.id);
    expect(inJardinera.length).toBe(2);

    // Desvincular una planta
    db.updatePot(planta1.id, { containerId: null });
    pots = db.getPots();
    expect(pots.filter(p => p.containerId === jardinera.id).length).toBe(1);
    expect(db.getPot(planta1.id).containerId).toBeNull();
  });
});

