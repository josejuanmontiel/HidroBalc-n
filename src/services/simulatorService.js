/**
 * Servicio de Simulación y Casos de Prueba para Riego
 * Permite alternar entre el clima real de Open-Meteo y escenarios de prueba extremos
 * para verificar el comportamiento agronómico del sistema.
 */

export const SIMULATION_SCENARIOS = {
  REAL_WEATHER: {
    id: 'real',
    name: '📍 Clima Real (GPS / Open-Meteo)',
    description: 'Datos meteorológicos en vivo para tu ubicación real.',
    icon: '🛰️',
    isSimulation: false
  },
  HEATWAVE_SUMMER: {
    id: 'heatwave',
    name: '🔥 Caso 1: Ola de Calor Veraniega',
    description: '39°C máx, 24°C mín, 0 mm lluvia, evapotranspiración extrema (7.8 mm/día). Macetas secándose a velocidad récord.',
    icon: '☀️',
    isSimulation: true,
    data: {
      currentTemp: 37,
      maxTemp: 39,
      minTemp: 23,
      rainSum: 0,
      rainProb: 0,
      et0: 7.8,
      weatherCode: 0,
      description: 'Cielo despejado, calor abrasador'
    }
  },
  FROST_WINTER: {
    id: 'frost',
    name: '❄️ Caso 2: Helada Crítica Nocturna',
    description: '-2.5°C mín prevista esta noche, 6°C máx. Peligro de congelación de raíces en macetas. Suspensión obligatoria de riego.',
    icon: '🧊',
    isSimulation: true,
    data: {
      currentTemp: 4,
      maxTemp: 6,
      minTemp: -2.5,
      rainSum: 0,
      rainProb: 10,
      et0: 1.1,
      weatherCode: 71,
      description: 'Frío polar con riesgo severo de helada'
    }
  },
  RAIN_STORM_AUTUMN: {
    id: 'rain_storm',
    name: '🌧️ Caso 3: Temporal de Lluvia de Otoño',
    description: '14°C máx, 8°C mín, 26 mm de lluvia. Pone a prueba el contraste entre macetas a cielo abierto y bajo techo.',
    icon: '🌧️',
    isSimulation: true,
    data: {
      currentTemp: 11,
      maxTemp: 14,
      minTemp: 8,
      rainSum: 26,
      rainProb: 95,
      et0: 1.5,
      weatherCode: 65,
      description: 'Lluvia intensa continua'
    }
  },
  FROST_WARNING: {
    id: 'frost_warning',
    name: '⚠️ Caso 4: Escarcha y Frío Limítrofe (1.8°C)',
    description: 'Mínima de 1.8°C. Riego sólo permitido en horas centrales del día para no dejar agua estancada de noche.',
    icon: '🧣',
    isSimulation: true,
    data: {
      currentTemp: 7,
      maxTemp: 12,
      minTemp: 1.8,
      rainSum: 0,
      rainProb: 15,
      et0: 1.8,
      weatherCode: 2,
      description: 'Cielo nuboso y noche muy fría con escarcha'
    }
  }
};

class SimulatorService {
  constructor() {
    this.currentScenarioId = (typeof localStorage !== 'undefined' && localStorage.getItem)
      ? (localStorage.getItem('riego_sim_scenario') || 'real')
      : 'real';
  }

  getActiveScenarioId() {
    return this.currentScenarioId;
  }

  getActiveScenario() {
    return SIMULATION_SCENARIOS[this.currentScenarioId.toUpperCase()] ||
      Object.values(SIMULATION_SCENARIOS).find(s => s.id === this.currentScenarioId) ||
      SIMULATION_SCENARIOS.REAL_WEATHER;
  }

  setScenario(scenarioId) {
    this.currentScenarioId = scenarioId;
    localStorage.setItem('riego_sim_scenario', scenarioId);
  }

  isSimulated() {
    const sc = this.getActiveScenario();
    return Boolean(sc.isSimulation);
  }

  getSimulatedData() {
    const sc = this.getActiveScenario();
    return sc.isSimulation ? sc.data : null;
  }
}

export const simulatorService = new SimulatorService();
