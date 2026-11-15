/**
 * Capa de Persistencia Local (LocalStorage)
 * Gestiona el inventario de macetas, el historial de riegos y la configuración.
 */

export const APP_VERSION = '1.5.0';

const STORAGE_KEYS = {
  POTS: 'riego_balcon_pots',
  CONTAINERS: 'riego_balcon_containers',
  ZONES: 'riego_balcon_zones',
  LOGS: 'riego_balcon_history',
  SETTINGS: 'riego_balcon_settings',
  VERSION: 'riego_balcon_app_version',
  SNAPSHOT: 'riego_balcon_last_snapshot',
  WEATHER_HISTORY: 'riego_balcon_weather_history'
};

const MAX_LOGS = 5000;
const MAX_WEATHER_HISTORY_DAYS = 730;
const FINGER_MOISTURE_PERCENT_FALLBACK = { 0: 15, 1: 35, 2: 68, 3: 92 };

const DEFAULT_ZONES = [
  {
    id: 'zone-terraza-sur',
    name: 'Barandilla Principal (Sur - Pleno Sol)',
    orientation: 'south',
    shadow: 'none',
    isCovered: false,
    notes: 'Zona abierta con máximo sol directo durante todo el día.'
  },
  {
    id: 'zone-rincon-este',
    name: 'Rincón de Entrada (Este - Semisombra)',
    orientation: 'east',
    shadow: 'partial_building',
    isCovered: true,
    notes: 'Protegida bajo el techo con sol suave de mañana y sombra por el edificio lateral.'
  }
];

const DEFAULT_CONTAINERS = [
  {
    id: 'container-jardinera-principal',
    name: 'Jardinera Corrida Balcón Sur',
    material: 'terracotta',
    totalLiters: 40,
    sections: 3,
    sunExposure: 'full_sun',
    isCovered: true,
    zoneId: 'zone-terraza-sur',
    notes: 'Jardinera rectangular de barro cocido con 3 compartimentos para aromáticas y flores.'
  }
];

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
    this._memStorage = {};
    this.init();
  }

  _getItem(key) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem) {
        return localStorage.getItem(key);
      }
    } catch {
      // ignore
    }
    return this._memStorage[key] || null;
  }

  _setItem(key, value) {
    this._memStorage[key] = value;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.setItem) {
        localStorage.setItem(key, value);
      }
    } catch {
      // ignore
    }
  }

  _removeItem(key) {
    delete this._memStorage[key];
    try {
      if (typeof localStorage !== 'undefined' && localStorage.removeItem) {
        localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
  }

  init() {
    // 1. Detección de actualización y Safety Snapshot automático (Enfoque B)
    const savedVersion = this._getItem(STORAGE_KEYS.VERSION);
    if (savedVersion !== APP_VERSION) {
      this._createSafetySnapshotOnVersionChange(savedVersion, APP_VERSION);
      this._setItem(STORAGE_KEYS.VERSION, APP_VERSION);
    }

    // 2. Comprobar si el usuario desactivó voluntariamente el modo demo
    const settings = this.getSettings();
    const demoDisabled = Boolean(settings.demoModeDisabled);

    if (!demoDisabled) {
      if (!this._getItem(STORAGE_KEYS.POTS)) {
        this.savePots(DEFAULT_POTS);
      }
      if (!this._getItem(STORAGE_KEYS.CONTAINERS)) {
        this.saveContainers(DEFAULT_CONTAINERS);
      }
      if (!this._getItem(STORAGE_KEYS.ZONES)) {
        this.saveZones(DEFAULT_ZONES);
      }
    } else {
      if (!this._getItem(STORAGE_KEYS.POTS)) this.savePots([]);
      if (!this._getItem(STORAGE_KEYS.CONTAINERS)) this.saveContainers([]);
      if (!this._getItem(STORAGE_KEYS.ZONES)) this.saveZones([]);
    }
  }

  /**
   * Crea una instantánea de seguridad interna ante un cambio de versión o actualización
   */
  _createSafetySnapshotOnVersionChange(fromVersion, toVersion) {
    try {
      const pots = this.getPots();
      const containers = this.getContainers();
      const zones = this.getZones();
      const settings = this.getSettings();
      const logs = this.getLogs();
      const weatherHistory = this.getWeatherHistory();

      // Solo crear snapshot si ya hay macetas o datos existentes
      if (pots && pots.length > 0) {
        const snapshotKey = `riego_balcon_safety_snapshot_${fromVersion || 'initial'}_to_${toVersion}`;
        const snapshotData = {
          date: new Date().toISOString(),
          fromVersion: fromVersion || '1.4.0',
          toVersion,
          pots,
          containers,
          zones,
          settings,
          logs,
          weatherHistory
        };

        this._setItem(snapshotKey, JSON.stringify(snapshotData));

        const snapshotMeta = {
          key: snapshotKey,
          date: snapshotData.date,
          fromVersion: snapshotData.fromVersion,
          toVersion,
          potCount: pots.length,
          containerCount: (containers || []).length
        };
        this._setItem(STORAGE_KEYS.SNAPSHOT, JSON.stringify(snapshotMeta));
        console.log(`[Safety Snapshot] Creada copia de seguridad automática (${fromVersion || 'inicial'} -> ${toVersion}) con ${pots.length} macetas.`);
      }
    } catch (err) {
      console.warn('[Safety Snapshot] Error creando snapshot preventivo:', err);
    }
  }

  /**
   * Obtiene la última instantánea de seguridad automática
   */
  getLatestSafetySnapshot() {
    try {
      const meta = this._getItem(STORAGE_KEYS.SNAPSHOT);
      return meta ? JSON.parse(meta) : null;
    } catch {
      return null;
    }
  }

  /**
   * Restaura los datos desde una instantánea de seguridad
   */
  restoreSafetySnapshot(snapshotKey = null) {
    try {
      const targetKey = snapshotKey || this.getLatestSafetySnapshot()?.key;
      if (!targetKey) return { success: false, message: 'No hay instantánea de seguridad disponible.' };

      const raw = this._getItem(targetKey);
      if (!raw) return { success: false, message: 'Instantánea no encontrada.' };

      const snapshot = JSON.parse(raw);
      if (snapshot.pots) this.savePots(snapshot.pots);
      if (snapshot.containers) this.saveContainers(snapshot.containers);
      if (snapshot.zones) this.saveZones(snapshot.zones);
      if (snapshot.settings) this.saveSettings(snapshot.settings);
      if (snapshot.logs) this.saveLogs(snapshot.logs);
      if (snapshot.weatherHistory) this.saveWeatherHistory(snapshot.weatherHistory);

      return {
        success: true,
        date: snapshot.date,
        potCount: (snapshot.pots || []).length
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Limpia todos los datos de demostración para arrancar con el balcón en blanco
   */
  clearDemoData() {
    const settings = this.getSettings();
    settings.demoModeDisabled = true;
    this.saveSettings(settings);

    this.savePots([]);
    this.saveContainers([]);
    this.saveZones([]);
    this._removeItem(STORAGE_KEYS.LOGS);
    return true;
  }

  /**
   * Carga los datos de demostración de fábrica para experimentar
   */
  loadDemoData() {
    const settings = this.getSettings();
    settings.demoModeDisabled = false;
    this.saveSettings(settings);

    this.savePots(DEFAULT_POTS);
    this.saveContainers(DEFAULT_CONTAINERS);
    this.saveZones(DEFAULT_ZONES);
    return DEFAULT_POTS;
  }

  getPots() {
    try {
      const data = this._getItem(STORAGE_KEYS.POTS);
      return data ? JSON.parse(data) : DEFAULT_POTS;
    } catch {
      return DEFAULT_POTS;
    }
  }

  savePots(pots) {
    try {
      this._setItem(STORAGE_KEYS.POTS, JSON.stringify(pots));
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
      id: pot.id || `pot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
   * Registra una acción de riego con telemetría estructurada
   */
  recordWatering(potId, timestamp = new Date().toISOString(), notes = '', telemetry = {}) {
    const pots = this.getPots();
    const pot = pots.find(p => p.id === potId);
    if (pot) {
      pot.lastWatered = timestamp;
      this.savePots(pots);

      // Guardar en log histórico estructurado
      const logs = this.getLogs();
      logs.unshift({
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: telemetry.type || 'watering',
        potId,
        potName: pot.name,
        date: timestamp,
        notes,
        doseMl: telemetry.doseMl ?? pot.calibratedDoseMl ?? null,
        doseGlasses: telemetry.doseGlasses ?? null,
        moistureBefore: telemetry.moistureBefore ?? null,
        moistureAfter: 100,
        isAdjustment: Boolean(telemetry.isAdjustment),
        learnedDryingFactorBefore: telemetry.learnedDryingFactorBefore ?? pot.learnedDryingFactor ?? 1.0,
        learnedDryingFactorAfter: telemetry.learnedDryingFactorAfter ?? pot.learnedDryingFactor ?? 1.0,
        weatherSnapshot: telemetry.weatherSnapshot ?? null
      });
      // Mantener histórico amplio (hasta MAX_LOGS registros)
      this.saveLogs(logs.slice(0, MAX_LOGS));
      return pot;
    }
    return null;
  }

  /**
   * Registra una "Prueba del Dedo" calibrando la maceta y guardando telemetría histórica completa
   */
  recordFingerTest(potId, telemetry = {}) {
    const pot = this.getPot(potId);
    if (!pot) return null;

    const timestamp = telemetry.date || new Date().toISOString();
    const observedLevel = telemetry.observedMoistureLevel ?? 1;
    const observedMoisturePercent = typeof telemetry.observedMoisturePercent === 'number'
      ? telemetry.observedMoisturePercent
      : (FINGER_MOISTURE_PERCENT_FALLBACK[observedLevel] ?? 35);

    const previousFactor = pot.learnedDryingFactor || 1.0;
    const newFactor = telemetry.newLearnedDryingFactor ?? previousFactor;
    const previousDoseMl = pot.calibratedDoseMl || null;
    const newDoseMl = telemetry.newDoseMl ?? previousDoseMl;
    const calibrationCount = telemetry.calibrationCount ?? ((pot.calibrationCount || 0) + 1);

    const updatedPot = this.updatePot(potId, {
      learnedDryingFactor: newFactor,
      calibratedDoseMl: newDoseMl,
      calibrationCount,
      lastFingerTest: {
        date: timestamp,
        level: observedLevel,
        moisturePercent: observedMoisturePercent,
        daysElapsed: telemetry.daysElapsed ?? null,
        meanTempObserved: telemetry.meanTempObserved ?? null,
        estimatedMoistureBefore: telemetry.estimatedMoistureBefore ?? null
      }
    });

    const logs = this.getLogs();
    logs.unshift({
      id: `log-finger-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'finger_test',
      potId,
      potName: pot.name,
      date: timestamp,
      fingerLevel: observedLevel,
      moistureBefore: telemetry.estimatedMoistureBefore ?? null,
      moistureAfter: observedMoisturePercent,
      daysElapsed: telemetry.daysElapsed ?? null,
      meanTempObserved: telemetry.meanTempObserved ?? null,
      learnedDryingFactorBefore: previousFactor,
      learnedDryingFactorAfter: newFactor,
      doseMlBefore: previousDoseMl,
      doseMlAfter: newDoseMl,
      doseGlassesAfter: telemetry.newDoseGlasses ?? null,
      weatherSnapshot: telemetry.weatherSnapshot ?? null,
      notes: telemetry.notes || `Prueba del dedo (Nivel ${observedLevel} -> ${observedMoisturePercent}% humedad). Factor: ${previousFactor}x -> ${newFactor}x`
    });
    this.saveLogs(logs.slice(0, MAX_LOGS));

    return updatedPot;
  }

  /**
   * Marca todas las macetas como regadas hoy
   */
  recordWaterAll(timestamp = new Date().toISOString(), weatherSnapshot = null) {
    const pots = this.getPots();
    pots.forEach(p => {
      p.lastWatered = timestamp;
    });
    this.savePots(pots);

    const logs = this.getLogs();
    logs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'water_all',
      potId: 'all',
      potName: 'Riego general de terraza (Todas)',
      date: timestamp,
      moistureAfter: 100,
      weatherSnapshot,
      notes: 'Riego conjunto con manguera / regadera'
    });
    this.saveLogs(logs.slice(0, MAX_LOGS));
    return pots;
  }

  // ================= CONTENEDORES / JARDINERAS PADRE ================= //

  getContainers() {
    try {
      const data = this._getItem(STORAGE_KEYS.CONTAINERS);
      return data ? JSON.parse(data) : DEFAULT_CONTAINERS;
    } catch {
      return DEFAULT_CONTAINERS;
    }
  }

  saveContainers(containers) {
    try {
      this._setItem(STORAGE_KEYS.CONTAINERS, JSON.stringify(containers));
    } catch (e) {
      console.error('Error saving containers:', e);
    }
  }

  getContainer(id) {
    const containers = this.getContainers();
    return containers.find(c => c.id === id);
  }

  addContainer(container) {
    const containers = this.getContainers();
    const newContainer = {
      ...container,
      id: container.id || `container-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString()
    };
    containers.push(newContainer);
    this.saveContainers(containers);
    return newContainer;
  }

  updateContainer(id, updates) {
    const containers = this.getContainers();
    const index = containers.findIndex(c => c.id === id);
    if (index !== -1) {
      containers[index] = { ...containers[index], ...updates };
      this.saveContainers(containers);
      return containers[index];
    }
    return null;
  }

  deleteContainer(id) {
    const containers = this.getContainers().filter(c => c.id !== id);
    this.saveContainers(containers);
    // Desvincular macetas que estuvieran en este contenedor
    const pots = this.getPots();
    let modified = false;
    pots.forEach(p => {
      if (p.containerId === id) {
        p.containerId = null;
        modified = true;
      }
    });
    if (modified) {
      this.savePots(pots);
    }
    return containers;
  }

  // ================= ZONAS DE LA TERRAZA / BALCÓN ("CONTENEDOR DE CONTENEDORES") ================= //

  getZones() {
    try {
      const data = this._getItem(STORAGE_KEYS.ZONES);
      return data ? JSON.parse(data) : DEFAULT_ZONES;
    } catch {
      return DEFAULT_ZONES;
    }
  }

  saveZones(zones) {
    try {
      this._setItem(STORAGE_KEYS.ZONES, JSON.stringify(zones));
    } catch (e) {
      console.error('Error saving zones:', e);
    }
  }

  getZone(id) {
    const zones = this.getZones();
    return zones.find(z => z.id === id);
  }

  addZone(zone) {
    const zones = this.getZones();
    const newZone = {
      ...zone,
      id: zone.id || `zone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString()
    };
    zones.push(newZone);
    this.saveZones(zones);
    return newZone;
  }

  updateZone(id, updates) {
    const zones = this.getZones();
    const index = zones.findIndex(z => z.id === id);
    if (index !== -1) {
      zones[index] = { ...zones[index], ...updates };
      this.saveZones(zones);
      return zones[index];
    }
    return null;
  }

  deleteZone(id) {
    const zones = this.getZones().filter(z => z.id !== id);
    this.saveZones(zones);
    // Desvincular jardineras y macetas asociadas a esta zona
    const containers = this.getContainers();
    let contMod = false;
    containers.forEach(c => {
      if (c.zoneId === id) {
        c.zoneId = null;
        contMod = true;
      }
    });
    if (contMod) this.saveContainers(containers);

    const pots = this.getPots();
    let potsMod = false;
    pots.forEach(p => {
      if (p.zoneId === id) {
        p.zoneId = null;
        potsMod = true;
      }
    });
    if (potsMod) this.savePots(pots);

    return zones;
  }

  getSettings() {
    try {
      const data = this._getItem(STORAGE_KEYS.SETTINGS);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  saveSettings(settings) {
    try {
      this._setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.warn('Error saving settings:', e);
    }
  }

  resetSettings() {
    this._removeItem(STORAGE_KEYS.SETTINGS);
    return {};
  }

  getLogs() {
    try {
      const data = this._getItem(STORAGE_KEYS.LOGS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  saveLogs(logs) {
    try {
      this._setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
    } catch (e) {
      console.warn('Error saving logs:', e);
    }
  }

  // ================= ARCHIVO HISTÓRICO METEOROLÓGICO DIARIO ================= //

  getWeatherHistory() {
    try {
      const data = this._getItem(STORAGE_KEYS.WEATHER_HISTORY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  getWeatherHistoryList() {
    const map = this.getWeatherHistory();
    return Object.values(map).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }

  saveWeatherHistory(historyMap) {
    try {
      this._setItem(STORAGE_KEYS.WEATHER_HISTORY, JSON.stringify(historyMap || {}));
    } catch (e) {
      console.warn('Error saving weather history:', e);
    }
  }

  mergeWeatherDays(daysArray = [], locationName = '') {
    if (!Array.isArray(daysArray) || daysArray.length === 0) {
      return this.getWeatherHistory();
    }

    const history = { ...this.getWeatherHistory() };
    daysArray.forEach(d => {
      if (!d || !d.date) return;
      history[d.date] = {
        date: d.date,
        maxTemp: d.maxTemp ?? 22,
        minTemp: d.minTemp ?? 12,
        rainSum: d.rainSum ?? 0,
        rainProb: d.rainProb ?? 0,
        et0: d.et0 ?? 3.5,
        weatherCode: d.weatherCode ?? 0,
        locationName: locationName || d.locationName || history[d.date]?.locationName || ''
      };
    });

    // Retener hasta MAX_WEATHER_HISTORY_DAYS (2 años) manteniendo las fechas más recientes
    const dates = Object.keys(history).sort();
    if (dates.length > MAX_WEATHER_HISTORY_DAYS) {
      const toRemove = dates.slice(0, dates.length - MAX_WEATHER_HISTORY_DAYS);
      toRemove.forEach(dateKey => delete history[dateKey]);
    }

    this.saveWeatherHistory(history);
    return history;
  }

  resetToDefaults() {
    this.savePots(DEFAULT_POTS);
    this.saveContainers(DEFAULT_CONTAINERS);
    this.saveZones(DEFAULT_ZONES);
    this.resetSettings();
    this._removeItem(STORAGE_KEYS.LOGS);
    this._removeItem(STORAGE_KEYS.WEATHER_HISTORY);
    return DEFAULT_POTS;
  }
}

export const db = new Database();
