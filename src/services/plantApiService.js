/**
 * Servicio Integrado de Datos Botánicos
 * - Catálogo Curado Offline (100 especies de España)
 * - Wikipedia REST API (es.wikipedia.org) con resúmenes y fotos Wikimedia Commons
 * - OpenFarm API (openfarm.cc) con fallback inteligente a GrowStuff API
 */

import { SPANISH_PLANTS_CATALOG } from '../data/spanishPlantsCatalog.js';

class PlantApiService {
  constructor() {
    this.catalog = SPANISH_PLANTS_CATALOG;
    this.wikiCache = new Map();
    this.openFarmCache = new Map();
  }

  /**
   * Búsqueda en el catálogo curado offline (100 especies de España)
   * 100% offline, respuesta < 1ms
   */
  searchCatalog(query = '', category = null) {
    let results = this.catalog;

    if (category && category !== 'all') {
      results = results.filter(p => p.category === category);
    }

    if (!query || query.trim() === '') {
      return results;
    }

    const q = query.toLowerCase().trim();
    return results.filter(p => {
      const matchName = p.name.toLowerCase().includes(q);
      const matchSci = p.scientificName.toLowerCase().includes(q);
      const matchTags = p.tags && p.tags.some(t => t.toLowerCase().includes(q));
      const matchDesc = p.description.toLowerCase().includes(q);
      return matchName || matchSci || matchTags || matchDesc;
    });
  }

  /**
   * Obtiene una planta del catálogo por su ID
   */
  getCatalogPlantById(id) {
    return this.catalog.find(p => p.id === id) || null;
  }

  /**
   * Búsqueda en Wikipedia en Español vía REST API
   * Endpoint de búsqueda: action=opensearch
   * Endpoint de detalle: /api/rest_v1/page/summary/{title}
   */
  async searchWikipedia(query) {
    if (!query || query.trim().length < 2) return [];

    const cacheKey = `wiki_${query.toLowerCase().trim()}`;
    if (this.wikiCache.has(cacheKey)) {
      return this.wikiCache.get(cacheKey);
    }

    try {
      // 1. Buscar títulos coincidentes con opensearch
      const searchUrl = `https://es.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&namespace=0&format=json&origin=*`;
      const res = await fetch(searchUrl, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`Wikipedia HTTP error: ${res.status}`);

      const data = await res.json();
      const titles = data[1] || [];
      if (titles.length === 0) return [];

      // 2. Extraer resúmenes y fotos para los primeros 3 resultados
      const summaryPromises = titles.slice(0, 3).map(async (title) => {
        try {
          const summaryUrl = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
          const sumRes = await fetch(summaryUrl, { credentials: 'omit', signal: AbortSignal.timeout(3500) });
          if (!sumRes.ok) return null;
          const sumData = await sumRes.json();
          if (sumData.type === 'disambiguation') return null;

          return {
            source: 'wikipedia',
            sourceBadge: 'Wikipedia ES',
            title: sumData.title,
            displayTitle: sumData.title,
            scientificName: sumData.description || 'Especie botánica',
            extract: sumData.extract || '',
            thumbnail: sumData.thumbnail?.source || null,
            originalImage: sumData.originalimage?.source || null,
            pageUrl: sumData.content_urls?.desktop?.page || null,
            inferredAgronomics: this.inferAgronomics(sumData.title, sumData.extract || '')
          };
        } catch {
          return null;
        }
      });

      const summaries = (await Promise.all(summaryPromises)).filter(Boolean);
      this.wikiCache.set(cacheKey, summaries);
      return summaries;
    } catch (err) {
      console.warn('Wikipedia API fetch falló o sin conexión:', err.message);
      return [];
    }
  }

  /**
   * Búsqueda en OpenFarm API con fallback automático a GrowStuff
   * Nota: openfarm.cc cesó servidores y redirige a GitHub;
   * GrowStuff es la API libre y abierta viva con soporte CORS.
   */
  async searchOpenFarm(query) {
    if (!query || query.trim().length < 2) return [];

    const cacheKey = `openfarm_${query.toLowerCase().trim()}`;
    if (this.openFarmCache.has(cacheKey)) {
      return this.openFarmCache.get(cacheKey);
    }

    // 1. Intento primario: OpenFarm API
    try {
      const openFarmUrl = `https://openfarm.cc/api/v1/crops?filter=${encodeURIComponent(query)}`;
      const res = await fetch(openFarmUrl, { signal: AbortSignal.timeout(2000) });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data) && json.data.length > 0) {
          const items = json.data.slice(0, 4).map(item => {
            const attrs = item.attributes || {};
            return {
              source: 'openfarm',
              sourceBadge: 'OpenFarm.cc',
              title: attrs.name || query,
              scientificName: attrs.binomial_name || '',
              extract: attrs.description || `Guía de cultivo para ${attrs.name}. Días hasta cosecha: ${attrs.median_days_to_first_harvest || 'N/A'}.`,
              thumbnail: attrs.main_image_path || null,
              sunRequirement: attrs.sun_requirements || 'Full Sun',
              sowingMethod: attrs.sowing_method || '',
              inferredAgronomics: this.inferAgronomics(attrs.name, attrs.description || '')
            };
          });
          this.openFarmCache.set(cacheKey, items);
          return items;
        }
      }
    } catch {
      // Fallback esperado debido a la redirección/estado de openfarm.cc
    }

    // 2. Fallback resiliente: GrowStuff Open API (CORS habilitado, activa y libre)
    try {
      const growStuffUrl = `https://www.growstuff.org/api/v1/crops/search.json?term=${encodeURIComponent(query)}`;
      const res = await fetch(growStuffUrl, { signal: AbortSignal.timeout(3500) });
      if (!res.ok) throw new Error(`GrowStuff HTTP error: ${res.status}`);

      const json = await res.json();
      const records = json.data || json || [];
      if (!Array.isArray(records) || records.length === 0) return [];

      const items = records.slice(0, 4).map(r => {
        const attrs = r.attributes || r;
        const name = attrs.name || '';
        const perennial = attrs.perennial ? 'Perenne' : 'Anual';
        const days = attrs['median-days-to-first-harvest'];
        const desc = `Cultivo ${perennial.toLowerCase()}. ${days ? `Cosecha estimada a los ${days} días.` : ''}`;

        return {
          source: 'openfarm',
          sourceBadge: 'OpenFarm / GrowStuff',
          title: name.charAt(0).toUpperCase() + name.slice(1),
          scientificName: attrs['en-wikipedia-url'] ? attrs['en-wikipedia-url'].split('/').pop().replace(/_/g, ' ') : 'Cultivo hortícola',
          extract: desc,
          thumbnail: null,
          inferredAgronomics: this.inferAgronomics(name, desc)
        };
      });

      this.openFarmCache.set(cacheKey, items);
      return items;
    } catch (err) {
      console.warn('OpenFarm / GrowStuff API no disponible:', err.message);
      return [];
    }
  }

  /**
   * Deducción agronómica automática a partir de nombres o descripciones
   */
  inferAgronomics(title = '', text = '') {
    const combined = `${title} ${text}`.toLowerCase();

    // 1. Tipo de planta
    let plantType = 'foliage';
    let icon = '🌿';
    let defaultSun = 'full_sun';
    let defaultSize = 'medium';
    let defaultMaterial = 'terracotta';

    if (combined.includes('cactus') || combined.includes('suculenta') || combined.includes('crassula') || combined.includes('aloe') || combined.includes('sedum')) {
      plantType = 'succulent_cactus';
      icon = '🌵';
      defaultSun = 'full_sun';
      defaultMaterial = 'terracotta';
      defaultSize = 'small';
    } else if (combined.includes('tomate') || combined.includes('pimiento') || combined.includes('lechuga') || combined.includes('huerto') || combined.includes('berenjena') || combined.includes('calabacín') || combined.includes('fresa') || combined.includes('crop') || combined.includes('vegetable')) {
      plantType = 'vegetable';
      icon = '🍅';
      defaultSun = 'full_sun';
      defaultMaterial = 'plastic';
      defaultSize = 'large';
    } else if (combined.includes('limon') || combined.includes('naranj') || combined.includes('citrus') || combined.includes('frutal') || combined.includes('árbol') || combined.includes('kumquat')) {
      plantType = 'citrus';
      icon = '🍋';
      defaultSun = 'full_sun';
      defaultMaterial = 'terracotta';
      defaultSize = 'large';
    } else if (combined.includes('romero') || combined.includes('tomillo') || combined.includes('lavanda') || combined.includes('salvia') || combined.includes('orégano') || combined.includes('aromatic')) {
      plantType = 'aromatic_woody';
      icon = '🌿';
      defaultSun = 'full_sun';
      defaultMaterial = 'terracotta';
      defaultSize = 'medium';
    } else if (combined.includes('flor') || combined.includes('geranio') || combined.includes('petunia') || combined.includes('rosa') || combined.includes('clavel') || combined.includes('hortensia')) {
      plantType = 'flowering';
      icon = '🌸';
      defaultSun = 'full_sun';
      defaultMaterial = 'terracotta';
      defaultSize = 'medium';
    }

    if (combined.includes('sombra') || combined.includes('interior') || combined.includes('shade') || combined.includes('helecho') || combined.includes('pothos')) {
      defaultSun = 'shade';
    } else if (combined.includes('semisombra') || combined.includes('partial sun')) {
      defaultSun = 'partial_shade';
    }

    return {
      plantType,
      icon,
      defaultSun,
      defaultSize,
      defaultMaterial
    };
  }

  /**
   * Búsqueda combinada para el asistente de alta de macetas
   */
  async searchAll(query = '', category = null) {
    const catalogMatches = this.searchCatalog(query, category);

    // Si la búsqueda es corta o está vacía, retornar solo el catálogo offline para máxima velocidad
    if (!query || query.trim().length < 2) {
      return {
        catalog: catalogMatches,
        wikipedia: [],
        openfarm: [],
        isOnlineQueried: false
      };
    }

    // Si hay query, lanzar consultas en paralelo a Wikipedia y OpenFarm en segundo plano
    const [wikiMatches, openFarmMatches] = await Promise.all([
      this.searchWikipedia(query),
      this.searchOpenFarm(query)
    ]);

    return {
      catalog: catalogMatches,
      wikipedia: wikiMatches,
      openfarm: openFarmMatches,
      isOnlineQueried: true
    };
  }
}

export const plantApiService = new PlantApiService();
