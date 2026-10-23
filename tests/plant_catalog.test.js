import { describe, it, expect } from 'vitest';
import { SPANISH_PLANTS_CATALOG, CATEGORIES_LABELS } from '../src/data/spanishPlantsCatalog.js';
import { plantApiService } from '../src/services/plantApiService.js';

describe('Catálogo Curado de 100 Plantas de España', () => {
  it('contiene exactamente 100 plantas curadas para el clima español', () => {
    expect(SPANISH_PLANTS_CATALOG.length).toBe(100);
  });

  it('cada planta tiene todos los metadatos agronómicos requeridos', () => {
    const validPlantTypes = ['vegetable', 'aromatic_woody', 'flowering', 'citrus', 'succulent_cactus', 'foliage'];
    const validSizes = ['small', 'medium', 'large', 'planter'];
    const validMaterials = ['terracotta', 'plastic', 'ceramic'];
    const validSuns = ['full_sun', 'partial_shade', 'shade'];

    const ids = new Set();

    SPANISH_PLANTS_CATALOG.forEach((plant, idx) => {
      expect(plant.id, `Planta #${idx} sin ID válido`).toBeTruthy();
      expect(ids.has(plant.id), `ID duplicado: ${plant.id}`).toBe(false);
      ids.add(plant.id);

      expect(plant.name).toBeTruthy();
      expect(plant.scientificName).toBeTruthy();
      expect(plant.icon).toBeTruthy();
      expect(validPlantTypes).toContain(plant.plantType);
      expect(validSizes).toContain(plant.defaultSize);
      expect(validMaterials).toContain(plant.defaultMaterial);
      expect(validSuns).toContain(plant.defaultSun);
      expect(plant.description.length).toBeGreaterThan(15);
    });
  });

  it('permite filtrar por categorías', () => {
    const aromatics = plantApiService.searchCatalog('', 'aromatic');
    expect(aromatics.length).toBe(20);

    const vegetables = plantApiService.searchCatalog('', 'vegetable');
    expect(vegetables.length).toBe(22);

    const succulents = plantApiService.searchCatalog('', 'succulent');
    expect(succulents.length).toBe(12);
  });

  it('busca plantas por término de búsqueda en español', () => {
    const results = plantApiService.searchCatalog('tomate');
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results.some(p => p.id === 'tomate_cherry')).toBe(true);
    expect(results.some(p => p.id === 'tomate_raf')).toBe(true);

    const romero = plantApiService.searchCatalog('romero');
    expect(romero.some(p => p.id === 'romero_comun')).toBe(true);
    expect(romero.some(p => p.id === 'romero_rastrero')).toBe(true);
  });

  it('deduce inteligentemente el perfil agronómico desde textos externos', () => {
    const cactusProfile = plantApiService.inferAgronomics('Echinocactus grusonii', 'Cactus bola de oro con espinas');
    expect(cactusProfile.plantType).toBe('succulent_cactus');

    const tomatoProfile = plantApiService.inferAgronomics('Solanum', 'Fruto comestible del huerto con mucha agua');
    expect(tomatoProfile.plantType).toBe('vegetable');

    const shadeProfile = plantApiService.inferAgronomics('Helecho', 'Planta de interior para sombra húmeda');
    expect(shadeProfile.defaultSun).toBe('shade');
  });
});
