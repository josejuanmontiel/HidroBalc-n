/**
 * Servicio Meteorológico con Integración Open-Meteo
 * Consulta temperatura máxima/mínima, lluvia, probabilidad y evapotranspiración FAO-56.
 * Incluye caché local y compatibilidad con el servicio de simulación.
 */

import { simulatorService } from './simulatorService.js';

const CACHE_KEY = 'riego_weather_cache';
const LOCATION_KEY = 'riego_saved_location';

// Ubicación por defecto: Madrid, España
const DEFAULT_LOCATION = {
  name: 'Madrid (Centro)',
  latitude: 40.4168,
  longitude: -3.7038,
  country: 'España'
};

export class WeatherService {
  constructor() {
    this.location = this.loadSavedLocation();
  }

  loadSavedLocation() {
    try {
      const saved = localStorage.getItem(LOCATION_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_LOCATION;
    } catch {
      return DEFAULT_LOCATION;
    }
  }

  saveLocation(location) {
    this.location = location;
    try {
      localStorage.setItem(LOCATION_KEY, JSON.stringify(location));
      localStorage.removeItem(CACHE_KEY); // Invalidar caché al cambiar de ubicación
    } catch (e) {
      console.warn('Error saving location:', e);
    }
  }

  getLocation() {
    return this.location;
  }

  /**
   * Obtiene la previsión meteorológica actual y para los próximos días
   * @param {boolean} forceRefresh - Si es true, ignora la caché local
   */
  async getForecast(forceRefresh = false) {
    // Si hay un escenario de simulación activo, devolver datos sintéticos
    if (simulatorService.isSimulated()) {
      const simData = simulatorService.getSimulatedData();
      return {
        ...simData,
        locationName: simulatorService.getActiveScenario().name,
        isSimulated: true,
        forecastDays: this.generateSimulatedForecast(simData)
      };
    }

    // Comprobar caché local (válida por 45 minutos)
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          const ageMinutes = (Date.now() - parsed.timestamp) / (1000 * 60);
          if (ageMinutes < 45) {
            return parsed.data;
          }
        }
      } catch (e) {
        console.warn('Error leyendo caché meteorológica:', e);
      }
    }

    // Consulta real a la API de Open-Meteo
    const { latitude, longitude, name } = this.location;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration,weathercode&hourly=temperature_2m,relative_humidity_2m&timezone=auto`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Error Open-Meteo HTTP ${response.status}`);
      }
      const data = await response.json();

      const current = data.current_weather || {};
      const daily = data.daily || {};

      const currentTemp = current.temperature ?? 20;
      const maxTemp = daily.temperature_2m_max?.[0] ?? currentTemp + 4;
      const minTemp = daily.temperature_2m_min?.[0] ?? currentTemp - 5;
      const rainSum = daily.precipitation_sum?.[0] ?? 0;
      const rainProb = daily.precipitation_probability_max?.[0] ?? 0;
      const et0 = daily.et0_fao_evapotranspiration?.[0] ?? 3.5;
      const weatherCode = current.weathercode ?? 0;

      const forecastDays = [];
      if (daily.time) {
        for (let i = 0; i < Math.min(7, daily.time.length); i++) {
          forecastDays.push({
            date: daily.time[i],
            maxTemp: daily.temperature_2m_max[i],
            minTemp: daily.temperature_2m_min[i],
            rainSum: daily.precipitation_sum[i],
            rainProb: daily.precipitation_probability_max[i],
            et0: daily.et0_fao_evapotranspiration ? daily.et0_fao_evapotranspiration[i] : 3.5,
            weatherCode: daily.weathercode ? daily.weathercode[i] : 0
          });
        }
      }

      const formatted = {
        locationName: name,
        latitude,
        longitude,
        currentTemp,
        maxTemp,
        minTemp,
        rainSum,
        rainProb,
        et0,
        weatherCode,
        description: this.getWeatherDescription(weatherCode),
        forecastDays,
        isSimulated: false,
        updatedAt: new Date().toISOString()
      };

      // Guardar en caché
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          timestamp: Date.now(),
          data: formatted
        }));
      } catch (e) {
        console.warn('Error guardando caché meteorológica:', e);
      }

      return formatted;
    } catch (error) {
      console.error('Fallo al obtener clima en vivo, usando datos de contingencia:', error);
      return this.getFallbackWeather();
    }
  }

  generateSimulatedForecast(simData) {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 5; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      days.push({
        date: d.toISOString().split('T')[0],
        maxTemp: simData.maxTemp + (i > 0 ? (Math.random() * 2 - 1) : 0),
        minTemp: simData.minTemp + (i > 0 ? (Math.random() * 2 - 1) : 0),
        rainSum: simData.rainSum,
        rainProb: simData.rainProb,
        et0: simData.et0,
        weatherCode: simData.weatherCode
      });
    }
    return days;
  }

  getFallbackWeather() {
    return {
      locationName: this.location.name,
      currentTemp: 21,
      maxTemp: 24,
      minTemp: 13,
      rainSum: 0,
      rainProb: 10,
      et0: 3.4,
      weatherCode: 1,
      description: 'Clima templado (Estimación local)',
      forecastDays: [],
      isSimulated: false,
      isFallback: true,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Búsqueda de localidades mediante la Geocoding API de Open-Meteo
   */
  async searchCities(query) {
    if (!query || query.trim().length < 2) return [];
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=es&format=json`;
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results || []).map(r => ({
        name: `${r.name}${r.admin1 ? ', ' + r.admin1 : ''}`,
        latitude: r.latitude,
        longitude: r.longitude,
        country: r.country
      }));
    } catch (e) {
      console.warn('Error buscando localidades:', e);
      return [];
    }
  }

  getWeatherDescription(code) {
    const codes = {
      0: 'Despejado',
      1: 'Mayormente despejado',
      2: 'Parcialmente nublado',
      3: 'Nublado',
      45: 'Niebla',
      48: 'Niebla con escarcha',
      51: 'Llovizna ligera',
      53: 'Llovizna moderada',
      55: 'Llovizna densa',
      61: 'Lluvia ligera',
      63: 'Lluvia moderada',
      65: 'Lluvia fuerte',
      71: 'Nevada ligera',
      73: 'Nevada moderada',
      75: 'Nevada fuerte / Helada',
      80: 'Chubascos',
      95: 'Tormenta'
    };
    return codes[code] || 'Clima variable';
  }
}

export const weatherService = new WeatherService();
