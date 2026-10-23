/**
 * Capa de Persistencia Local (LocalStorage)
 * Gestiona el inventario de macetas, el historial de riegos y la configuración.
 */

const STORAGE_KEYS = {
  POTS: 'riego_balcon_pots',
  LOGS: 'riego_balcon_history',
  SETTINGS: 'riego_balcon_settings'
};

const DEFAULT_POTS = [
  {
    id: 'pot-tomates-1',
    name: 'Tomates Cherry de Balcón',
    plantType: 'vegetable',
    material: 'plastic',
    size: 'large',
    sunExposure: 'full_sun',
    isCovered: false, // al aire libre
    notes: 'Planta voraz de agua cuando cuaja los tomatitos.',
    lastWatered: new Date(Date.now() - 86400000 * 1.5).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString()
  },
  {
    id: 'pot-geranio-2',
    name: 'Geranios Balconeros (Gitanilla)',
    plantType: 'flowering',
    material: 'terracotta',
    size: 'medium',
    sunExposure: 'full_sun',
    isCovered: true, // bajo techo de la terraza
    notes: 'En jardinera de barro; las paredes transpiran mucho.',
    lastWatered: new Date(Date.now() - 86400000 * 2.5).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 45).toISOString()
  },
  {
    id: 'pot-limonero-3',
    name: 'Limonero 4 Estaciones',
    plantType: 'citrus',
    material: 'terracotta',
    size: 'large',
    sunExposure: 'full_sun',
    isCovered: false,
    notes: 'Sensible al frío en raíces durante el invierno.',
    lastWatered: new Date(Date.now() - 86400000 * 3).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 60).toISOString()
  },
  {
    id: 'pot-aromaticas-4',
    name: 'Romero y Albahaca',
    plantType: 'aromatic_woody',
    material: 'plastic',
    size: 'medium',
    sunExposure: 'partial_sun',
    isCovered: true,
    notes: 'El romero aguanta bien; la albahaca avisa desmayando hojas.',
    lastWatered: new Date(Date.now() - 86400000 * 4).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 20).toISOString()
  },
  {
    id: 'pot-suculentas-5',
    name: 'Colección Crasas y Echeverias',
    plantType: 'succulent_cactus',
    material: 'terracotta',
    size: 'small',
    sunExposure: 'full_sun',
    isCovered: true,
    notes: 'Solo regar cuando la tierra esté completamente seca como polvo.',
    lastWatered: new Date(Date.now() - 86400000 * 12).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 90).toISOString()
  }
];

export class Database {
  constructor() {
    this.init();
  }

  init() {
    if (typeof localStorage !== 'undefined' && localStorage.getItem) {
      if (!localStorage.getItem(STORAGE_KEYS.POTS)) {
        this.savePots(DEFAULT_POTS);
      }
    }
  }

  getPots() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem) {
        const data = localStorage.getItem(STORAGE_KEYS.POTS);
        return data ? JSON.parse(data) : DEFAULT_POTS;
      }
      return DEFAULT_POTS;
    } catch {
      return DEFAULT_POTS;
    }
  }

  savePots(pots) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.setItem) {
        localStorage.setItem(STORAGE_KEYS.POTS, JSON.stringify(pots));
      }
    } catch (e) {
      console.error('Error saving pots:', e);
    }
  }

  getPot(id) {
    const pots = this.getPots();
    return pots.find(p => p.id === id);
  }

  addPot(pot) {
    const pots = this.getPots();
    const newPot = {
      ...pot,
      id: pot.id || `pot-${Date.now()}`,
      createdAt: new Date().toISOString(),
      lastWatered: pot.lastWatered || new Date().toISOString()
    };
    pots.push(newPot);
    this.savePots(pots);
    return newPot;
  }

  updatePot(id, updates) {
    const pots = this.getPots();
    const index = pots.findIndex(p => p.id === id);
    if (index !== -1) {
      pots[index] = { ...pots[index], ...updates };
      this.savePots(pots);
      return pots[index];
    }
    return null;
  }

  deletePot(id) {
    const pots = this.getPots().filter(p => p.id !== id);
    this.savePots(pots);
    return pots;
  }

  /**
   * Registra una acción de riego
   */
  recordWatering(potId, timestamp = new Date().toISOString(), notes = '') {
    const pots = this.getPots();
    const pot = pots.find(p => p.id === potId);
    if (pot) {
      pot.lastWatered = timestamp;
      this.savePots(pots);

      // Guardar en log histórico
      const logs = this.getLogs();
      logs.unshift({
        id: `log-${Date.now()}`,
        potId,
        potName: pot.name,
        date: timestamp,
        notes
      });
      // Mantener últimos 100 registros
      this.saveLogs(logs.slice(0, 100));
      return pot;
    }
    return null;
  }

  /**
   * Marca todas las macetas como regadas hoy
   */
  recordWaterAll(timestamp = new Date().toISOString()) {
    const pots = this.getPots();
    pots.forEach(p => {
      p.lastWatered = timestamp;
    });
    this.savePots(pots);

    const logs = this.getLogs();
    logs.unshift({
      id: `log-${Date.now()}`,
      potId: 'all',
      potName: 'Riego general de terraza (Todas)',
      date: timestamp,
      notes: 'Riego conjunto con manguera / regadera'
    });
    this.saveLogs(logs.slice(0, 100));
    return pots;
  }

  getLogs() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.LOGS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  saveLogs(logs) {
    try {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
    } catch (e) {
      console.warn('Error saving logs:', e);
    }
  }

  resetToDefaults() {
    this.savePots(DEFAULT_POTS);
    localStorage.removeItem(STORAGE_KEYS.LOGS);
    return DEFAULT_POTS;
  }
}

export const db = new Database();
