/**
 * HidroBalcón PWA - Lógica Principal de la Aplicación
 */

import './style.css';
import { db } from './storage/db.js';
import { photoDb } from './storage/photoDb.js';
import { weatherService } from './services/weatherService.js';
import { simulatorService, SIMULATION_SCENARIOS } from './services/simulatorService.js';
import {
  calculatePotWatering,
  analyzeWeatherRisks,
  PLANT_TYPES,
  POT_MATERIALS,
  POT_SIZES,
  SUN_EXPOSURES
} from './engine/irrigationEngine.js';
import { notificationService } from './services/notificationService.js';
import { alarmService } from './services/alarmService.js';
import { audioService } from './services/audioService.js';
import { wasmEngineService } from './services/wasmEngineService.js';
import { backupService } from './services/backupService.js';
import { plantApiService } from './services/plantApiService.js';
import { CATEGORIES_LABELS } from './data/spanishPlantsCatalog.js';

class HidroBalconApp {
  constructor() {
    this.currentTab = 'all'; // 'all' | 'due' | 'frost' | 'good'
    this.activeView = 'balcony'; // 'balcony' | 'tasks'
    this.taskDateFilter = this.getTodayDateStr();
    this.weatherData = null;
    this.pots = [];
    this.potCovers = {}; // map de potId -> dataUrl de la foto de portada
    this.potDoses = {};  // map de potId -> { doseMl, doseGlasses, explanation, isAdapted }
    this.timerSeconds = 180;
    this.initialTimerSeconds = 180;
    this.timerInterval = null;
    this.editingPotId = null;

    // Detectar si el usuario abrió la app desde un link de calendario ?view=tasks&date=...
    if (typeof window !== 'undefined' && window.location.search) {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('view') === 'tasks') {
        this.activeView = 'tasks';
        if (urlParams.get('date')) {
          this.taskDateFilter = urlParams.get('date');
        }
      }
    }

    this.init();
  }

  getTodayDateStr() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async init() {
    this.registerServiceWorker();
    await this.refreshData();
    this.render();
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        const baseUrl = import.meta.env.BASE_URL || '/';
        const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
        navigator.serviceWorker.register(`${cleanBase}sw.js`)
          .then((reg) => {
            console.log('ServiceWorker v2 registrado con éxito:', reg.scope);
          })
          .catch((err) => {
            console.warn('Error registrando ServiceWorker:', err);
          });
      });
    }
  }

  async refreshData(forceWeather = false) {
    this.pots = db.getPots();
    this.containers = db.getContainers();
    this.weatherData = await weatherService.getForecast(forceWeather);

    // Cargar fotos de portada, fotos iniciales y calcular dosis con motor WebAssembly en Go
    this.potCovers = {};
    this.potInitials = {};
    this.potDoses = {};
    for (const pot of this.pots) {
      // Asociar contenedor si existe
      if (pot.containerId) {
        pot.container = this.containers.find(c => c.id === pot.containerId) || null;
      } else {
        pot.container = null;
      }

      try {
        const cover = await photoDb.getCoverPhoto(pot.id);
        if (cover) {
          this.potCovers[pot.id] = cover.dataUrl;
        }
        const initial = await photoDb.getInitialPhoto(pot.id);
        if (initial) {
          this.potInitials[pot.id] = initial.dataUrl;
        }
      } catch (err) {
        console.warn('Error cargando fotos para', pot.id, err);
      }

      try {
        const dose = await wasmEngineService.calculateDose(pot, this.weatherData);
        this.potDoses[pot.id] = dose;
      } catch (err) {
        console.warn('Error calculando dosis con Wasm para', pot.id, err);
      }
    }
  }

  getCalculatedPots() {
    const now = new Date();
    return this.pots.map(pot => {
      // Asegurar que pot.container está disponible
      if (pot.containerId && !pot.container) {
        pot.container = (this.containers || db.getContainers()).find(c => c.id === pot.containerId) || null;
      }
      const calculation = calculatePotWatering(pot, this.weatherData, now);
      return {
        ...pot,
        calc: calculation
      };
    });
  }

  getFilteredPots(calculatedPots) {
    if (this.currentTab === 'due') {
      return calculatedPots.filter(p => p.calc.status === 'urgent' || p.calc.status === 'due');
    }
    if (this.currentTab === 'frost') {
      return calculatedPots.filter(p => p.calc.status === 'frozen_hold');
    }
    if (this.currentTab === 'good') {
      return calculatedPots.filter(p => p.calc.status === 'good' || p.calc.status === 'saturated');
    }
    return calculatedPots;
  }

  render() {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    const calculatedPots = this.getCalculatedPots();
    const risks = analyzeWeatherRisks(this.weatherData);
    const activeScenario = simulatorService.getActiveScenario();
    const notifPermission = notificationService.getPermission();
    const dayGroups = alarmService.groupPotsByWateringDay(calculatedPots);

    const dueCount = calculatedPots.filter(p => p.calc.status === 'urgent' || p.calc.status === 'due').length;

    appEl.innerHTML = `
      <div class="app-container">
        <!-- HEADER -->
        <header class="main-header">
          <div class="brand-wrapper">
            <img src="${(import.meta.env.BASE_URL || './').replace(/\/?$/, '/')}favicon.svg" alt="HidroBalcón Logo" class="brand-logo-img" onerror="this.onerror=null; this.src='./favicon.svg';" />
            <div class="brand-info">
              <h1>HidroBalcón <span class="brand-badge">PWA</span></h1>
              <p>Riego agronómico en terraza, Wasm Go & prevención de heladas</p>
            </div>
          </div>
          <div class="header-actions">
            <!-- Navigation View Switcher -->
            <button id="btn-view-balcony" class="btn ${this.activeView === 'balcony' ? 'btn-primary' : ''}">
              🪴 Vista Balcón
            </button>
            <button id="btn-view-tasks" class="btn ${this.activeView === 'tasks' ? 'btn-primary' : ''}">
              📋 Tareas (${dueCount})
            </button>
            <button id="btn-open-backup" class="btn" title="Copia de seguridad y restauración completa">
              💾 Backup
            </button>
            <button id="btn-toggle-notif" class="btn ${notifPermission === 'granted' ? '' : 'btn-water'}" title="Configurar Notificaciones">
              ${notifPermission === 'granted' ? '🔔 Activas' : '🔔 Activar'}
            </button>
            <button id="btn-open-timer" class="btn" title="Temporizador de riego/inmersión">
              ⏱️ Timer
            </button>
            <button id="btn-apk-info" class="btn" title="Convertir a APK Nativo">
              📱 APK / PWA
            </button>
          </div>
        </header>

        <!-- SIMULATOR / TEST SCENARIO BAR -->
        <section class="simulation-bar" id="simulation-bar">
          <div class="sim-info">
            <span class="sim-label">${activeScenario.isSimulation ? '🧪 MODO SIMULACIÓN' : '📡 MODO TIEMPO'}</span>
            <span class="sim-desc">${activeScenario.description}</span>
          </div>
          <div class="sim-select-wrapper">
            <label for="scenario-select" class="form-label" style="margin:0; font-size:0.75rem;">Escenario:</label>
            <select id="scenario-select" class="sim-select">
              ${Object.values(SIMULATION_SCENARIOS).map(sc => `
                <option value="${sc.id}" ${sc.id === simulatorService.getActiveScenarioId() ? 'selected' : ''}>
                  ${sc.name}
                </option>
              `).join('')}
            </select>
          </div>
        </section>

        <!-- MAIN VIEW CONDITIONAL: BALCONY OR TASKS -->
        ${this.activeView === 'tasks'
          ? this.renderTasksView(calculatedPots, dayGroups)
          : this.renderBalconyView(calculatedPots, risks, dayGroups)
        }
      </div>

      <!-- MODALS -->
      <div id="modal-container"></div>
      <div class="toast-container" id="toast-container"></div>
    `;

    this.attachDomHandlers(calculatedPots, dayGroups);
  }

  // ================= VISTA DE BALCÓN (TRADICIONAL + AGENDA CONSOLIDADA) ================= //

  renderBalconyView(calculatedPots, risks, dayGroups) {
    const filteredPots = this.getFilteredPots(calculatedPots);
    const dueCount = calculatedPots.filter(p => p.calc.status === 'urgent' || p.calc.status === 'due').length;
    const frostCount = calculatedPots.filter(p => p.calc.status === 'frozen_hold').length;

    return `
      <!-- WEATHER & CRITICAL ALERT CARD -->
      <section class="weather-card">
        <div class="weather-snapshot">
          <div class="location-title">
            <span class="location-name">
              📍 <span id="loc-display-name">${this.weatherData?.locationName || 'Madrid'}</span>
            </span>
            <button id="btn-change-city" class="btn btn-sm" title="Cambiar Localidad">Cambiar</button>
          </div>
          
          <div class="temp-hero">
            <span class="temp-number">${Math.round(this.weatherData?.currentTemp ?? 20)}</span>
            <span class="temp-unit">°C</span>
            <span class="temp-range">
              Máx: <strong>${Math.round(this.weatherData?.maxTemp ?? 25)}°C</strong> | 
              Mín: <strong>${Math.round(this.weatherData?.minTemp ?? 15)}°C</strong>
            </span>
          </div>

          <div class="weather-condition">
            ${this.weatherData?.description || 'Despejado'}
          </div>

          <div class="weather-stats">
            <div class="stat-item" title="Lluvia acumulada">
              🌧️ <span>${this.weatherData?.rainSum ?? 0} mm</span>
            </div>
            <div class="stat-item" title="Probabilidad de precipitación">
              ☔ <span>${this.weatherData?.rainProb ?? 0}% prob.</span>
            </div>
            <div class="stat-item" title="Evapotranspiración de referencia FAO-56">
              💨 <span>ET₀: ${this.weatherData?.et0 ?? 3.5} mm/día</span>
            </div>
          </div>
        </div>

        <div class="weather-insight">
          ${this.renderAgronomicAlert(risks)}
          ${this.renderMiniForecast()}
        </div>
      </section>

      <!-- CONSOLIDATED AGENDA BAR: GRUPOS DE ALARMAS POR DÍA -->
      <section class="agenda-section">
        <div class="agenda-header">
          <div class="agenda-title">
            <h3>📅 Agenda de Alarmas Consolidadas (${dayGroups.length} días previstos)</h3>
            <p>Macetas agrupadas por mismo día: una sola alarma sonora y enlace directo a la lista de tareas</p>
          </div>
          <button id="btn-export-full-schedule" class="btn btn-sm btn-water" title="Descargar archivo .ics con todas las alarmas agrupadas de la semana">
            📥 Exportar Calendario Semanal
          </button>
        </div>

        <div class="agenda-days-grid">
          ${dayGroups.length > 0 ? dayGroups.map(group => {
            const isToday = group.dateKey === this.getTodayDateStr();
            const dateObj = new Date(group.dateKey + 'T00:00:00');
            const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

            return `
              <div class="agenda-day-card ${isToday ? 'is-today' : ''}">
                <div class="day-card-top">
                  <div class="day-card-date">
                    ${dayName}
                  </div>
                  ${isToday ? '<span class="day-badge-today">¡Hoy!</span>' : ''}
                </div>

                <div class="day-card-pots">
                  <strong style="color:#ffffff;">${group.count} maceta(s) programada(s):</strong>
                  ${group.pots.map(p => `
                    <div class="day-pot-pill">
                      <span>${p.calc.plantType.icon}</span>
                      <span>${p.name}</span>
                      <span style="color:var(--text-muted); font-size:0.7rem;">(${p.calc.soilMoisturePercent}%)</span>
                    </div>
                  `).join('')}
                </div>

                <div class="day-card-actions">
                  <button class="btn btn-sm btn-water btn-export-day-alarm" data-date="${group.dateKey}" title="Descargar alarma única .ics para este día">
                    ⏰ Alarma Conjunta
                  </button>
                  <button class="btn btn-sm btn-go-day-tasks" data-date="${group.dateKey}" title="Abrir checklist de tareas para este día">
                    📋 Ver Tareas
                  </button>
                </div>
              </div>
            `;
          }).join('') : `
            <div style="grid-column: 1/-1; text-align: center; padding: 1.5rem; color: var(--text-muted);">
              No hay riegos previstos próximamente (sustratos saturados o heladas activas).
            </div>
          `}
        </div>
      </section>

      <!-- POTS SECTION -->
      <section class="section-pots">
        <div class="section-header">
          <div class="section-title">
            <h2>Macetas en Terraza & Balcón (${calculatedPots.length})</h2>
            <p>Control individual por tipo de sustrato y exposición</p>
          </div>

          <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
            <div class="filter-tabs">
              <button class="tab-btn ${this.currentTab === 'all' ? 'active' : ''}" data-tab="all">
                Todas (${calculatedPots.length})
              </button>
              <button class="tab-btn ${this.currentTab === 'due' ? 'active' : ''}" data-tab="due">
                💧 Regar Hoy (${dueCount})
              </button>
              ${frostCount > 0 ? `
                <button class="tab-btn ${this.currentTab === 'frost' ? 'active' : ''}" data-tab="frost">
                  ❄️ Suspendidas (${frostCount})
                </button>
              ` : ''}
              <button class="tab-btn ${this.currentTab === 'good' ? 'active' : ''}" data-tab="good">
                🪴 Óptimas (${calculatedPots.length - dueCount})
              </button>
            </div>

            <button id="btn-water-all" class="btn btn-water btn-sm" title="Marcar todas como regadas">
              💧 Regar Todo
            </button>
            <button id="btn-open-containers" class="btn btn-sm" title="Gestionar Jardineras Corridas y Contenedores Compartidos">
              🪴 Jardineras
            </button>
            <button id="btn-add-pot" class="btn btn-primary btn-sm" title="Añadir nueva planta / maceta">
              ➕ Nueva Planta
            </button>
          </div>
        </div>

        <!-- POTS GRID -->
        <div class="pots-grid" id="pots-grid">
          ${filteredPots.length > 0
            ? filteredPots.map(p => this.renderPotCard(p)).join('')
            : `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">
                 No hay macetas en este filtro.
               </div>`
          }
        </div>
      </section>
    `;
  }

  // ================= VISTA DE TAREAS (CHECKLIST INTERACTIVO DESDE LA ALARMA) ================= //

  renderTasksView(calculatedPots, dayGroups) {
    const activeGroup = dayGroups.find(g => g.dateKey === this.taskDateFilter) || dayGroups[0] || {
      dateKey: this.taskDateFilter,
      pots: [],
      count: 0
    };

    const taskPots = activeGroup.pots.length > 0
      ? activeGroup.pots
      : calculatedPots.filter(p => p.calc.status === 'urgent' || p.calc.status === 'due');

    const nowMs = Date.now();
    const isCompleted = (pot) => {
      if (!pot.lastWatered) return false;
      const lastMs = new Date(pot.lastWatered).getTime();
      return (nowMs - lastMs) < (1000 * 60 * 60 * 8);
    };

    const completedCount = taskPots.filter(p => isCompleted(p)).length;
    const totalCount = taskPots.length;
    const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    const dateObj = new Date(activeGroup.dateKey + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

    const currentUrl = typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?view=tasks&date=${activeGroup.dateKey}`
      : `?view=tasks&date=${activeGroup.dateKey}`;

    return `
      <section class="tasks-view">
        <div class="tasks-banner">
          <div class="tasks-title-area">
            <h2>📋 Tareas de Riego: ${formattedDate}</h2>
            <p>Lista interactiva vinculada a tu alarma de calendario. Marca las macetas a medida que las riegas.</p>
          </div>

          <div class="tasks-progress-wrapper">
            <div class="tasks-progress-header">
              <span>Progreso de riego:</span>
              <span><strong>${completedCount} de ${totalCount}</strong> (${progressPercent}%)</span>
            </div>
            <div class="tasks-progress-bar-bg">
              <div class="tasks-progress-bar-fill" style="width: ${progressPercent}%;"></div>
            </div>
          </div>
        </div>

        <!-- Date selector tabs if multiple days exist -->
        ${dayGroups.length > 1 ? `
          <div style="display:flex; gap:0.5rem; overflow-x:auto; padding-bottom:0.25rem;">
            ${dayGroups.map(g => {
              const d = new Date(g.dateKey + 'T00:00:00');
              const label = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
              const isSelected = g.dateKey === activeGroup.dateKey;
              return `
                <button class="btn btn-sm ${isSelected ? 'btn-primary' : ''} btn-switch-task-date" data-date="${g.dateKey}">
                  📅 ${label} (${g.count})
                </button>
              `;
            }).join('')}
          </div>
        ` : ''}

        <!-- Top Actions Bar for Tasks -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
          <div style="display:flex; gap:0.5rem;">
            <button class="btn btn-sm btn-water" id="btn-water-all-tasks" title="Marcar todas las macetas de esta lista como regadas">
              💧 Marcar Todas como Regadas
            </button>
            <button class="btn btn-sm" id="btn-copy-task-link" data-url="${currentUrl}" title="Copiar enlace directo a esta lista">
              🔗 Copiar Enlace Directo
            </button>
          </div>

          <button class="btn btn-sm btn-export-day-alarm" data-date="${activeGroup.dateKey}" title="Exportar la alarma para este día">
            ⏰ Descargar Alarma Calendario (.ics)
          </button>
        </div>

        <!-- Checklist -->
        <div class="tasks-checklist">
          ${totalCount > 0 ? taskPots.map(pot => {
            const completed = isCompleted(pot);
            const calc = pot.calc;
            const plant = calc.plantType;
            const coverPhoto = this.potCovers[pot.id];
            const dose = this.potDoses[pot.id] || { doseGlasses: 2.0, doseMl: 500, isAdapted: false };

            let tip = 'Riego homogéneo hasta humedecer bien el cepellón.';
            if (pot.material === 'terracotta') {
              tip = 'Maceta de barro: vierte el agua en 2 tandas para que las paredes no absorban todo de golpe.';
            } else if (pot.plantType === 'succulent_cactus') {
              tip = 'Cactus/Suculenta: agua moderada directa al sustrato sin mojar la corona.';
            } else if (pot.plantType === 'vegetable') {
              tip = 'Huerto/Tomates: riego generoso en la base sin salpicar hojas para evitar hongos.';
            } else if (pot.isCovered) {
              tip = 'Bajo techo: revisar plato inferior y retirar el exceso de agua a los 15 minutos.';
            }

            return `
              <div class="task-item-card ${completed ? 'is-completed' : ''}" id="task-card-${pot.id}">
                <div class="task-card-main">
                  <button class="task-checkbox-btn btn-task-toggle" data-id="${pot.id}" aria-label="${completed ? 'Marcar como pendiente' : 'Marcar como regada'}" title="${completed ? 'Marcar como pendiente' : 'Marcar como regada'}">
                    ${completed ? '✓' : ''}
                  </button>

                  <div class="task-thumb-wrap">
                    ${coverPhoto
                      ? `<img src="${coverPhoto}" alt="${pot.name}" class="pot-thumb-img" />`
                      : `<div class="pot-thumb-placeholder">${plant.icon}</div>`
                    }
                  </div>

                  <div class="task-details">
                    <div class="task-title-row">
                      <div class="pot-name-row">
                        <h4>${pot.name}</h4>
                        <button class="btn-quick-rename" data-id="${pot.id}" data-name="${pot.name}" title="Editar nombre de la planta">✏️</button>
                      </div>
                      ${completed ? '<span class="task-badge-completed">✓ Regada</span>' : ''}
                    </div>

                    <div class="task-subinfo">
                      ${pot.container ? `<span class="task-info-chip tag-container-parent">🪴 ${pot.container.name}</span>` : ''}
                      <span class="task-info-chip">🪴 ${calc.material.label.split('(')[0]}</span>
                      <span class="task-info-chip">💧 Humedad: <strong>${calc.soilMoisturePercent}%</strong></span>
                      <span class="task-info-chip">🕒 ${calc.bestTimeOfDay}</span>
                      <span class="dose-pill ${dose.isAdapted ? 'is-adapted' : ''}">
                        💧 <strong>${dose.doseGlasses} vasos</strong> (~${dose.doseMl} ml)
                        <span class="wasm-tag ${dose.isAdapted ? 'wasm-adapted' : ''}">${dose.isAdapted ? '✨ Calibrada' : 'Wasm'}</span>
                      </span>
                    </div>

                    <div class="task-tip">
                      💡 ${tip}
                    </div>
                  </div>
                </div>

                <div class="task-actions-toolbar">
                  <div class="task-tools-group">
                    <button class="btn btn-sm btn-task-tool btn-action-finger" data-id="${pot.id}" title="Calibrar con la prueba del dedo">
                      👉 <span>Dedo</span>
                    </button>
                    <button class="btn btn-sm btn-task-tool btn-action-photos" data-id="${pot.id}" title="Ver fotos y evolución">
                      📸 <span>Fotos</span>
                    </button>
                    <button class="btn btn-sm btn-task-tool btn-action-climate-photo" data-id="${pot.id}" title="Foto de control climático">
                      📷 <span>Control</span>
                    </button>
                    <button class="btn btn-sm btn-task-tool btn-action-timer" data-id="${pot.id}" title="Temporizador de inmersión / riego">
                      ⏱️ <span>Timer</span>
                    </button>
                  </div>
                  <button class="btn btn-sm ${completed ? '' : 'btn-water'} btn-task-water-single" data-id="${pot.id}">
                    ${completed ? '↩ Volver a Regar' : '💧 Regar'}
                  </button>
                </div>
              </div>
            `;
          }).join('') : `
            <div style="text-align: center; padding: 3rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-subtle); color: var(--text-muted);">
              <h3>🎉 ¡Todo al día!</h3>
              <p style="margin-top:0.5rem;">No hay macetas que requieran riego en esta fecha.</p>
              <button class="btn btn-primary" id="btn-back-to-balcony" style="margin-top:1rem;">
                Volver a Vista Balcón
              </button>
            </div>
          `}
        </div>
      </section>
    `;
  }

  renderAgronomicAlert(risks) {
    if (risks.isFreezingTonight) {
      return `
        <div class="alert-banner frost-danger" role="alert">
          <div class="alert-icon">❄️</div>
          <div class="alert-text">
            <h3>¡ALERTA ROJA DE HELADA! (Mínima ${risks.minTemp}°C)</h3>
            <p>
              <strong>SUSPENSIÓN TOTAL DE RIEGO:</strong> En macetas, el frío congela las raíces desde los laterales y el agua expandida destruye los capilares radiculares. Además, puede agrietar macetas de barro. Resguarda tus plantas contra la pared o cúbrelas.
            </p>
            <div class="climate-alert-cta-row">
              <span class="climate-alert-cta-text">📸 <strong>Foto de Control:</strong> Documenta cómo han resistido las hojas al frío (${risks.minTemp}°C)</span>
              <button class="btn btn-sm btn-climate-control-cta" id="btn-banner-climate-control">
                📷 Registrar Foto de Control
              </button>
            </div>
          </div>
        </div>
      `;
    }

    if (risks.isFrostPossible) {
      return `
        <div class="alert-banner frost-warning" role="alert">
          <div class="alert-icon">⚠️</div>
          <div class="alert-text">
            <h3>Aviso de Escarcha Nocturna (Mínima ${risks.minTemp}°C)</h3>
            <p>
              Evita completamente regar al atardecer. Si alguna maceta está excesivamente seca, riégala exclusivamente en las horas centrales de sol (13:00) para que el sustrato drene antes de que caiga la noche.
            </p>
            <div class="climate-alert-cta-row">
              <span class="climate-alert-cta-text">📸 <strong>Foto de Control:</strong> Registra la turgencia foliar tras la noche fría</span>
              <button class="btn btn-sm btn-climate-control-cta" id="btn-banner-climate-control">
                📷 Registrar Foto de Control
              </button>
            </div>
          </div>
        </div>
      `;
    }

    if (risks.isHeatwave) {
      return `
        <div class="alert-banner heat-danger" role="alert">
          <div class="alert-icon">🔥</div>
          <div class="alert-text">
            <h3>Alerta por Ola de Calor (Máxima ${risks.maxTemp}°C)</h3>
            <p>
              Tasa de evapotranspiración crítica. Las macetas de terracota al sol pierden agua hasta 3 veces más rápido. Realiza riegos abundantes a primera hora de la mañana (antes de las 8:30) para no cocer las raíces bajo el sol directo.
            </p>
            <div class="climate-alert-cta-row">
              <span class="climate-alert-cta-text">📸 <strong>Foto de Control:</strong> Revisa y fotografía posibles quemaduras solares</span>
              <button class="btn btn-sm btn-climate-control-cta" id="btn-banner-climate-control">
                📷 Registrar Foto de Control
              </button>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="alert-banner normal-ok">
        <div class="alert-icon">🌿</div>
        <div class="alert-text">
          <h3>Condiciones Agronómicas Favorables</h3>
          <p>
            Temperaturas suaves (Mín: ${risks.minTemp}°C / Máx: ${risks.maxTemp}°C). Riego matutino recomendado según la necesidad particular de cada especie.
          </p>
          <div class="climate-alert-cta-row">
            <span class="climate-alert-cta-text">📸 <strong>Foto de Control:</strong> Lleva un registro visual del estado de salud de tus plantas</span>
            <button class="btn btn-sm btn-climate-control-cta" id="btn-banner-climate-control">
              📷 Foto de Control
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderMiniForecast() {
    if (!this.weatherData?.forecastDays || this.weatherData.forecastDays.length === 0) {
      return '';
    }

    return `
      <div class="forecast-strip">
        ${this.weatherData.forecastDays.slice(0, 5).map(day => {
          const d = new Date(day.date);
          const dayName = d.toLocaleDateString('es-ES', { weekday: 'short' });
          const isFrost = day.minTemp <= 2;
          return `
            <div class="forecast-pill" style="${isFrost ? 'border-color: #38bdf8; background: rgba(2, 132, 199, 0.1);' : ''}">
              <div class="forecast-day">${dayName}</div>
              <div class="forecast-temp" style="${isFrost ? 'color: #7dd3fc;' : ''}">
                ${Math.round(day.maxTemp)}° / ${Math.round(day.minTemp)}°
              </div>
              <div class="forecast-rain">
                ${day.rainSum > 0 ? `🌧️ ${day.rainSum}mm` : '☀️ 0mm'}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  renderPotCard(pot) {
    const calc = pot.calc;
    const plant = calc.plantType;
    const material = calc.material;
    const moisture = calc.soilMoisturePercent;
    const coverPhoto = this.potCovers[pot.id];
    const dose = this.potDoses[pot.id] || { doseGlasses: 2.0, doseMl: 500, isAdapted: false };

    let barColor = '#10b981';
    if (calc.status === 'urgent') barColor = '#ef4444';
    else if (calc.status === 'due') barColor = '#f59e0b';
    else if (calc.status === 'saturated') barColor = '#0284c7';
    else if (calc.status === 'frozen_hold') barColor = '#38bdf8';

    return `
      <article class="pot-card status-${calc.status}" id="pot-${pot.id}" data-pot-id="${pot.id}">
        <div>
          <div class="pot-header">
            ${coverPhoto
              ? `<img src="${coverPhoto}" alt="${pot.name}" class="pot-thumb-img" title="Foto de ${pot.name}" />`
              : `<div class="pot-icon" title="${plant.label}">${plant.icon}</div>`
            }
            <div class="pot-title-area">
              <div class="pot-name-row">
                <h3 class="pot-name">${pot.name}</h3>
                <button class="btn-quick-rename" data-id="${pot.id}" data-name="${pot.name}" title="Editar nombre de la planta">✏️</button>
              </div>
              <div class="pot-plant-type">${plant.label}</div>
              <div class="pot-tags">
                ${pot.container ? `<span class="tag tag-container-parent" title="Planta en jardinera corrida compartida">🪴 ${pot.container.name}</span>` : ''}
                <span class="tag tag-${pot.container ? pot.container.material : pot.material}">${material.label.split('(')[0]}</span>
                <span class="tag ${(pot.container ? pot.container.isCovered : pot.isCovered) ? 'tag-covered' : 'tag-open'}">
                  ${(pot.container ? pot.container.isCovered : pot.isCovered) ? '🏠 Balcón Techado' : '☁️ Cielo Abierto'}
                </span>
                <span class="tag">${calc.sun.label.split('(')[0]}</span>
              </div>
            </div>
          </div>

          <!-- Moisture Meter -->
          <div class="moisture-box" style="margin-top: 0.85rem;">
            <div class="moisture-label-row">
              <span style="color: var(--text-muted);">Humedad en Sustrato</span>
              <span class="moisture-percent" style="color: ${barColor};">${moisture}%</span>
            </div>
            <div class="moisture-bar-bg">
              <div class="moisture-bar-fill" style="width: ${moisture}%; background: ${barColor};"></div>
            </div>
          </div>

          <!-- DOSIS DE AGUA WASM -->
          <div class="dose-pill ${dose.isAdapted ? 'is-adapted' : ''}">
            <span>💧 Dosis Wasm: <strong>${dose.doseGlasses} vasos</strong> (~${dose.doseMl} ml)</span>
            <span class="wasm-tag ${dose.isAdapted ? 'wasm-adapted' : ''}">${dose.isAdapted ? '✨ Calibrada' : 'Wasm'}</span>
          </div>

          <!-- Recommendation box -->
          <div class="rec-box rec-${calc.status}" style="margin-top: 0.65rem;">
            <strong>${calc.actionTitle}</strong>
            <p>${calc.actionDescription}</p>
            <div class="rec-timing">
              <span>🕒 Horario óptimo:</span> ${calc.bestTimeOfDay}
            </div>
            ${calc.balconyNotice ? `<div class="balcony-warning-pill">${calc.balconyNotice}</div>` : ''}
          </div>
        </div>

        <!-- Action buttons -->
        <div class="pot-actions">
          <button class="btn btn-sm btn-water btn-action-water" data-id="${pot.id}" title="Marcar como regado ahora">
            💧 Regado
          </button>
          <button class="btn btn-sm btn-action-finger" data-id="${pot.id}" title="Calibrar con la prueba del dedo">
            👉 Dedo
          </button>
          <button class="btn btn-sm btn-action-photos" data-id="${pot.id}" title="Ver fotos y evolución botánica">
            📸 Fotos
          </button>
          <button class="btn btn-sm btn-action-climate-photo" data-id="${pot.id}" title="Foto de control tras alertas climáticas">
            📷 Control
          </button>
          <button class="btn btn-sm btn-action-alarm" data-id="${pot.id}" title="Programar alarma individual en calendario">
            ⏰ Alarma
          </button>
          <button class="btn btn-sm btn-action-timer" data-id="${pot.id}" title="Temporizador de inmersión / riego para esta maceta">
            ⏱️ Timer
          </button>
          <button class="btn btn-sm btn-action-edit" data-id="${pot.id}" title="Editar maceta">
            ✏️
          </button>
          <button class="btn btn-sm btn-danger btn-action-delete" data-id="${pot.id}" title="Eliminar maceta">
            🗑️
          </button>
        </div>
      </article>
    `;
  }

  attachDomHandlers(calculatedPots, dayGroups) {
    // View Switchers
    document.getElementById('btn-view-balcony')?.addEventListener('click', () => {
      this.activeView = 'balcony';
      this.render();
    });

    document.getElementById('btn-view-tasks')?.addEventListener('click', () => {
      this.activeView = 'tasks';
      this.render();
    });

    document.getElementById('btn-back-to-balcony')?.addEventListener('click', () => {
      this.activeView = 'balcony';
      this.render();
    });

    // Switch Task Date Tabs
    document.querySelectorAll('.btn-switch-task-date').forEach(btn => {
      btn.addEventListener('click', () => {
        this.taskDateFilter = btn.dataset.date;
        this.render();
      });
    });

    // Go to specific day tasks
    document.querySelectorAll('.btn-go-day-tasks').forEach(btn => {
      btn.addEventListener('click', () => {
        this.taskDateFilter = btn.dataset.date;
        this.activeView = 'tasks';
        this.render();
      });
    });

    // Export Consolidated Day Alarm
    document.querySelectorAll('.btn-export-day-alarm').forEach(btn => {
      btn.addEventListener('click', () => {
        const dateKey = btn.dataset.date;
        const group = dayGroups.find(g => g.dateKey === dateKey);
        if (group) {
          alarmService.exportConsolidatedDay(group);
          this.showToast(`Alarma conjunta exportada para ${dateKey} (${group.count} macetas) ⏰`, 'success');
        }
      });
    });

    // Export Full Schedule (All consolidated days)
    document.getElementById('btn-export-full-schedule')?.addEventListener('click', () => {
      if (dayGroups.length === 0) {
        this.showToast('No hay fechas con riego pendientes', 'info');
        return;
      }
      alarmService.exportFullSchedule(dayGroups);
      this.showToast('Calendario completo semanal exportado en un único archivo .ics 📅', 'success');
    });

    // Copy Task Link
    document.getElementById('btn-copy-task-link')?.addEventListener('click', (e) => {
      const url = e.currentTarget.dataset.url;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
          this.showToast('Enlace copiado al portapapeles 📋', 'success');
        }).catch(() => {
          prompt('Copia este enlace directo a tus tareas:', url);
        });
      } else {
        prompt('Copia este enlace directo a tus tareas:', url);
      }
    });

    // Tasks Checklist: Toggle Single Pot
    document.querySelectorAll('.btn-task-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const potId = e.currentTarget.dataset.id;
        audioService.playWaterDropSound();
        db.recordWatering(potId);
        this.pots = db.getPots();
        this.render();
        this.showToast('¡Maceta regada y marcada como completada! 💧', 'success');
      });
    });

    document.querySelectorAll('.btn-task-water-single').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const potId = e.currentTarget.dataset.id;
        this.openWaterConfirmationModal(potId);
      });
    });

    // Water all in tasks view
    document.getElementById('btn-water-all-tasks')?.addEventListener('click', () => {
      const activeGroup = dayGroups.find(g => g.dateKey === this.taskDateFilter);
      const targetPots = activeGroup?.pots || calculatedPots.filter(p => p.calc.status === 'urgent' || p.calc.status === 'due');

      if (confirm(`¿Marcar las ${targetPots.length} macetas como regadas hoy?`)) {
        audioService.playWaterDropSound();
        targetPots.forEach(p => db.recordWatering(p.id));
        this.pots = db.getPots();
        this.render();
        this.showToast('¡Todas las macetas de la lista marcadas como regadas! 🎉', 'success');
      }
    });

    // Scenario Select Change
    const scenarioSelect = document.getElementById('scenario-select');
    if (scenarioSelect) {
      scenarioSelect.addEventListener('change', async (e) => {
        simulatorService.setScenario(e.target.value);
        await this.refreshData(true);
        this.render();
        this.showToast(`Escenario activado: ${simulatorService.getActiveScenario().name}`, 'info');
      });
    }

    // Filter tabs in balcony view
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentTab = btn.dataset.tab;
        this.render();
      });
    });

    // Notification Permission button
    const notifBtn = document.getElementById('btn-toggle-notif');
    if (notifBtn) {
      notifBtn.addEventListener('click', async () => {
        const res = await notificationService.requestPermission();
        if (res === 'granted') {
          audioService.playChime();
          await notificationService.testNotification();
          this.showToast('¡Notificaciones activadas y aviso de prueba enviado!', 'success');
        } else {
          this.showToast('Permiso de notificaciones denegado o no disponible.', 'danger');
        }
        this.render();
      });
    }

    // Backup Button (Header)
    document.getElementById('btn-open-backup')?.addEventListener('click', () => {
      this.openBackupModal();
    });

    // Water All Button (Balcony)
    const waterAllBtn = document.getElementById('btn-water-all');
    if (waterAllBtn) {
      waterAllBtn.addEventListener('click', () => {
        if (confirm('¿Marcar todas las macetas como regadas hoy?')) {
          audioService.playWaterDropSound();
          db.recordWaterAll();
          this.pots = db.getPots();
          this.render();
          this.showToast('¡Todas las macetas registradas como regadas!', 'success');
        }
      });
    }

    // Add Pot Button
    document.getElementById('btn-add-pot')?.addEventListener('click', () => {
      this.openPotModal();
    });

    // Open Containers / Jardineras Button
    document.getElementById('btn-open-containers')?.addEventListener('click', () => {
      this.openContainersModal();
    });

    // Quick Rename Buttons
    document.querySelectorAll('.btn-quick-rename').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const currentName = btn.dataset.name;
        this.openQuickRenameModal(id, currentName);
      });
    });

    // Timer Button (Global)
    document.getElementById('btn-open-timer')?.addEventListener('click', () => {
      this.openTimerModal('Riego de Terraza');
    });

    // Change City Button
    document.getElementById('btn-change-city')?.addEventListener('click', () => {
      this.openCityModal();
    });

    // APK & PWA Info Button
    document.getElementById('btn-apk-info')?.addEventListener('click', () => {
      this.openApkModal();
    });

    // Climate Control Photo Button (Banner)
    document.getElementById('btn-banner-climate-control')?.addEventListener('click', () => {
      this.openClimateControlModal();
    });

    // Pot Card Actions Delegation (Balcony Grid & Tasks)
    const handlePotActionClick = (e) => {
      const btnFinger = e.target.closest('.btn-action-finger');
      if (btnFinger) {
        const id = btnFinger.dataset.id;
        this.openFingerTestModal(id);
        return;
      }

      const btnPhotos = e.target.closest('.btn-action-photos');
      if (btnPhotos) {
        const id = btnPhotos.dataset.id;
        this.openPhotosModal(id);
        return;
      }

      const btnClimate = e.target.closest('.btn-action-climate-photo');
      if (btnClimate) {
        const id = btnClimate.dataset.id;
        this.openClimateControlModal(id);
        return;
      }

      const btnWater = e.target.closest('.btn-action-water');
      if (btnWater) {
        const id = btnWater.dataset.id;
        this.openWaterConfirmationModal(id);
        return;
      }

      const btnAlarm = e.target.closest('.btn-action-alarm');
      if (btnAlarm) {
        const id = btnAlarm.dataset.id;
        const potWithCalc = this.getCalculatedPots().find(p => p.id === id);
        if (potWithCalc) {
          alarmService.scheduleWateringAlarm(potWithCalc.calc);
          this.showToast('Archivo de alarma .ics generado para tu calendario del móvil ⏰', 'info');
        }
        return;
      }

      const btnTimer = e.target.closest('.btn-action-timer');
      if (btnTimer) {
        const id = btnTimer.dataset.id;
        const pot = this.pots.find(p => p.id === id);
        this.openTimerModal(pot ? pot.name : 'Maceta');
        return;
      }

      const btnEdit = e.target.closest('.btn-action-edit');
      if (btnEdit) {
        const id = btnEdit.dataset.id;
        this.openPotModal(id);
        return;
      }

      const btnDelete = e.target.closest('.btn-action-delete');
      if (btnDelete) {
        const id = btnDelete.dataset.id;
        if (confirm('¿Seguro que deseas eliminar esta maceta?')) {
          db.deletePot(id);
          this.pots = db.getPots();
          this.render();
          this.showToast('Maceta eliminada', 'info');
        }
        return;
      }
    };

    const grid = document.getElementById('pots-grid');
    if (grid) grid.addEventListener('click', handlePotActionClick);

    const tasksList = document.querySelector('.tasks-checklist');
    if (tasksList) tasksList.addEventListener('click', handlePotActionClick);
  }

  // ================= MODAL PRUEBA DEL DEDO & CALIBRACIÓN WASM ================= //

  async openFingerTestModal(potId) {
    const container = document.getElementById('modal-container');
    if (!container) return;

    const pot = db.getPot(potId);
    if (!pot) return;

    const now = new Date();
    const lastWateredDate = pot.lastWatered ? new Date(pot.lastWatered) : new Date(now.getTime() - 86400000 * 2);
    const daysSince = Math.max(0.5, Math.round(((now - lastWateredDate) / (1000 * 60 * 60 * 24)) * 10) / 10);
    const currentTemp = Math.round(this.weatherData?.currentTemp ?? 22);
    const currentDose = this.potDoses[potId] || { doseGlasses: 2.0 };

    let selectedLevel = 1; // Nivel 1 por defecto

    container.innerHTML = `
      <div class="modal-overlay active" id="finger-test-modal">
        <div class="modal-content" style="max-width: 580px;">
          <div class="modal-header">
            <h3 class="modal-title">👆 Prueba del Dedo & Calibración Wasm: ${pot.name}</h3>
            <button class="modal-close" id="btn-close-finger-modal">&times;</button>
          </div>

          <p style="font-size:0.82rem; color:var(--text-muted); line-height:1.4;">
            Introduce tu dedo en el sustrato para comprobar la profundidad de humedad real. El <strong>motor WebAssembly en Go</strong> ajustará el factor de secado y la próxima dosis.
          </p>

          <!-- NIVELES DE HUMEDAD SEGÚN PROFUNDIDAD DEL DEDO -->
          <div class="finger-levels-grid" id="finger-grid">
            <div class="finger-level-card" data-level="0">
              <div class="finger-card-top">
                <div class="finger-icon-title">🏜️ Nivel 0: Seco Total</div>
                <span class="finger-depth-tag">> 5 cm</span>
              </div>
              <div class="finger-card-desc">Sustrato seco hasta el fondo del cepellón. Polvoriento y sin resistencia al dedo.</div>
            </div>

            <div class="finger-level-card selected" data-level="1">
              <div class="finger-card-top">
                <div class="finger-icon-title">🍂 Nivel 1: Humedad al Fondo</div>
                <span class="finger-depth-tag">3 - 5 cm</span>
              </div>
              <div class="finger-card-desc">Superficie y falange media secas. Solo se nota fresco al hundir el dedo entero.</div>
            </div>

            <div class="finger-level-card" data-level="2">
              <div class="finger-card-top">
                <div class="finger-icon-title">🌿 Nivel 2: Humedad Óptima</div>
                <span class="finger-depth-tag">1 - 3 cm</span>
              </div>
              <div class="finger-card-desc">Tierra fresca y húmeda a la profundidad de la primera falange. El ideal botánico.</div>
            </div>

            <div class="finger-level-card" data-level="3">
              <div class="finger-card-top">
                <div class="finger-icon-title">💧 Nivel 3: Muy Húmedo</div>
                <span class="finger-depth-tag">0 - 1 cm</span>
              </div>
              <div class="finger-card-desc">Sustrato empapado desde la misma superficie. La tierra se pega húmeda a la yema.</div>
            </div>
          </div>

          <!-- INPUTS DE CONDICIONES OBSERVADAS -->
          <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:0.85rem; display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; font-size:0.8rem;">
            <div class="form-group">
              <label class="form-label" for="input-days-elapsed">Días transcurridos desde el último riego:</label>
              <input type="number" step="0.5" id="input-days-elapsed" class="form-input" value="${daysSince}" />
            </div>

            <div class="form-group">
              <label class="form-label" for="input-mean-temp">Temperatura media observada (°C):</label>
              <input type="number" step="1" id="input-mean-temp" class="form-input" value="${currentTemp}" />
            </div>
          </div>

          <div id="finger-result-container" style="margin-top:0.6rem;"></div>

          <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.75rem;">
            <button class="btn" id="btn-cancel-finger">Cerrar</button>
            <button class="btn btn-primary" id="btn-submit-finger">
              ⚡ Calibrar con Motor Wasm
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-close-finger-modal')?.addEventListener('click', () => { container.innerHTML = ''; });
    document.getElementById('btn-cancel-finger')?.addEventListener('click', () => { container.innerHTML = ''; });

    // Level selection logic
    const cards = document.querySelectorAll('.finger-level-card');
    cards.forEach(c => {
      c.addEventListener('click', () => {
        cards.forEach(x => x.classList.remove('selected'));
        c.classList.add('selected');
        selectedLevel = parseInt(c.dataset.level, 10);
      });
    });

    // Calibrate button
    document.getElementById('btn-submit-finger')?.addEventListener('click', async () => {
      const daysElapsed = parseFloat(document.getElementById('input-days-elapsed')?.value || '2');
      const meanTemp = parseFloat(document.getElementById('input-mean-temp')?.value || '22');
      const resultBox = document.getElementById('finger-result-container');
      const submitBtn = document.getElementById('btn-submit-finger');

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Calculando en Go Wasm...';
      }

      try {
        const feedback = {
          daysElapsed,
          observedMoistureLevel: selectedLevel,
          waterGivenGlasses: currentDose.doseGlasses || 2.0,
          meanTempObserved: meanTemp
        };

        const result = await wasmEngineService.calibrateWithFingerTest(pot, feedback);

        // Guardar parámetros aprendidos en la base de datos
        db.updatePot(potId, {
          learnedDryingFactor: result.newLearnedDryingFactor,
          calibratedDoseMl: result.newDoseMl,
          calibrationCount: result.calibrationCount
        });

        audioService.playChime();

        if (resultBox) {
          resultBox.innerHTML = `
            <div class="feedback-result-box">
              <strong style="display:block; margin-bottom:0.25rem;">✨ Calibración Adaptativa Completada</strong>
              <p>${result.message}</p>
              <div style="margin-top:0.4rem; font-size:0.75rem; color:#cbd5e1;">
                Factor de secado adaptativo: <strong>${result.newLearnedDryingFactor}x</strong> | 
                Nueva dosis: <strong>${result.newDoseGlasses} vasos (~${result.newDoseMl} ml)</strong>
              </div>
            </div>
          `;
        }

        if (submitBtn) {
          submitBtn.innerText = '✓ Calibrado';
        }

        this.showToast('¡Modelo adaptativo Wasm actualizado con éxito! ✨', 'success');

        setTimeout(async () => {
          container.innerHTML = '';
          await this.refreshData();
          this.render();
        }, 1800);
      } catch (err) {
        alert('Error ejecutando calibración Wasm: ' + err.message);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = 'Reintentar';
        }
      }
    });
  }

  // ================= MODAL COPIA DE SEGURIDAD & RESTAURACIÓN ================= //

  openBackupModal() {
    const container = document.getElementById('modal-container');
    if (!container) return;

    container.innerHTML = `
      <div class="modal-overlay active" id="backup-modal">
        <div class="modal-content" style="max-width:560px;">
          <div class="modal-header">
            <h3 class="modal-title">💾 Copia de Seguridad & Restauración</h3>
            <button class="modal-close" id="btn-close-backup-modal">&times;</button>
          </div>

          <p style="font-size:0.82rem; color:var(--text-muted); line-height:1.4;">
            Guarda o restaura todo tu cuaderno botánico: macetas, calibraciones de riego aprendidas por Wasm, historial y fotos de evolución guardadas en IndexedDB.
          </p>

          <div style="display:flex; flex-direction:column; gap:1rem;">
            <!-- EXPORT CARD -->
            <div class="backup-card-option">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="font-size:0.92rem; color:#ffffff;">📥 Exportar Copia Completa</strong>
                <span class="tag tag-covered">JSON Portátil</span>
              </div>
              <p style="font-size:0.78rem; color:var(--text-muted);">
                Descarga un archivo seguro con todos tus datos y fotos en alta resolución codificadas. Ideal para no perder nada o migrar de móvil.
              </p>
              <button class="btn btn-water" id="btn-do-export-backup" style="align-self:flex-start;">
                💾 Descargar Copia de Seguridad (.json)
              </button>
            </div>

            <!-- IMPORT CARD -->
            <div class="backup-card-option">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="font-size:0.92rem; color:#ffffff;">📤 Restaurar desde Archivo</strong>
                <span class="tag">Restauración Total</span>
              </div>
              <p style="font-size:0.78rem; color:var(--text-muted);">
                Carga un archivo de respaldo previo. Se restaurarán tus macetas, calibraciones y álbum de fotos en tu navegador.
              </p>
              <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                <input type="file" id="input-backup-file" accept=".json,application/json" class="form-input" style="padding:0.4rem; font-size:0.75rem; flex:1;" />
                <button class="btn btn-primary" id="btn-do-import-backup" disabled>
                  Restaurar Datos
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-close-backup-modal')?.addEventListener('click', () => { container.innerHTML = ''; });

    // Export handler
    document.getElementById('btn-do-export-backup')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-do-export-backup');
      if (btn) btn.innerText = 'Empaquetando datos y fotos...';

      const stats = await backupService.exportFullBackup();
      this.showToast(`Copia exportada: ${stats.potCount} macetas y ${stats.photoCount} fotos 💾`, 'success');

      if (btn) btn.innerText = '💾 Descargar Copia de Seguridad (.json)';
    });

    // Import file input handler
    const fileInput = document.getElementById('input-backup-file');
    const importBtn = document.getElementById('btn-do-import-backup');

    fileInput?.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        importBtn.disabled = false;
      }
    });

    importBtn?.addEventListener('click', async () => {
      const file = fileInput?.files?.[0];
      if (!file) return;

      if (!confirm('¿Restaurar los datos del archivo seleccionado? Se combinarán tus macetas y fotos.')) {
        return;
      }

      importBtn.disabled = true;
      importBtn.innerText = 'Restaurando...';

      try {
        const stats = await backupService.importBackup(file);
        audioService.playChime();
        this.showToast(`¡Copia restaurada! ${stats.potCount} macetas y ${stats.photoCount} fotos 🎉`, 'success');
        container.innerHTML = '';
        await this.refreshData();
        this.render();
      } catch (err) {
        alert('Error restaurando copia de seguridad: ' + err.message);
        importBtn.disabled = false;
        importBtn.innerText = 'Restaurar Datos';
      }
    });
  }

  // ================= MODAL FOTO DE CONTROL TRAS ALERTAS CLIMÁTICAS ================= //

  openClimateControlModal(preselectedPotId = null) {
    const container = document.getElementById('modal-container');
    if (!container) return;

    const pots = db.getPots();
    if (pots.length === 0) {
      this.showToast('Primero añade al menos una maceta a tu balcón', 'info');
      return;
    }

    const risks = analyzeWeatherRisks(this.weatherData);
    const activePotId = preselectedPotId || pots[0].id;
    const currentTemp = Math.round(this.weatherData?.currentTemp ?? 20);

    let eventType = 'normal';
    let eventTitle = `Control Climático (${currentTemp}°C)`;
    let eventBadgeClass = 'rain';
    let eventBadgeText = `🌦️ Clima de Terraza (${currentTemp}°C)`;
    let eventAdvice = 'Monitorea y documenta cómo responden las hojas y el cepellón de tus plantas a los cambios térmicos del exterior.';
    let defaultTag = `🌦️ Control Climático (${currentTemp}°C)`;

    let defaultNoteOk = 'Planta vigorosa y turgente. Sin signos de estrés ambiental.';
    let defaultNoteWarn = 'Leve pérdida de turgencia o puntas secas por exposición al viento.';
    let defaultNoteDang = 'Decaimiento visible o caída de hojas tiernas tras el cambio de tiempo.';

    if (risks.isFreezingTonight) {
      eventType = 'frost_danger';
      eventTitle = `❄️ Control Post-Helada Severa (${risks.minTemp}°C)`;
      eventBadgeClass = '';
      eventBadgeText = `❄️ Helada Severa (${risks.minTemp}°C)`;
      eventAdvice = '<strong>Revisión de Helada:</strong> Comprueba si hay hojas translúcidas/vítreas (agua celular congelada), manchas negras en ápices o ramas colapsadas. Resguarda la maceta contra la fachada cálida y suspende el riego.';
      defaultTag = `❄️ Control Helada (${risks.minTemp}°C)`;
      defaultNoteOk = `Hojas verdes e intactas tras la helada de ${risks.minTemp}°C. El sustrato protegido amortiguó el frío.`;
      defaultNoteWarn = `Puntas foliares quemadas por escarcha. Corona y tallos principales a salvo.`;
      defaultNoteDang = `Necrosis foliar grave por congelación radicular a ${risks.minTemp}°C. Requiere poda de ramas muertas.`;
    } else if (risks.isFrostPossible) {
      eventType = 'frost_warning';
      eventTitle = `⚠️ Control Post-Escarcha (${risks.minTemp}°C)`;
      eventBadgeClass = '';
      eventBadgeText = `⚠️ Escarcha Limítrofe (${risks.minTemp}°C)`;
      eventAdvice = 'Comprueba si la escarcha matutina ha afectado a los brotes jóvenes más tiernos. Evita regar con agua fría.';
      defaultTag = `❄️ Control Escarcha (${risks.minTemp}°C)`;
      defaultNoteOk = `Sin daños por escarcha. Tejidos foliares turgentes.`;
      defaultNoteWarn = `Ligera curvatura en brotes nuevos por el bajón térmico nocturno.`;
      defaultNoteDang = `Hojas tiernas ennegrecidas por cristalización del rocío.`;
    } else if (risks.isHeatwave) {
      eventType = 'heat_wave';
      eventTitle = `🔥 Control Post-Ola de Calor (${risks.maxTemp}°C)`;
      eventBadgeClass = 'heat';
      eventBadgeText = `🔥 Ola de Calor Extrema (${risks.maxTemp}°C)`;
      eventAdvice = '<strong>Revisión Térmica:</strong> Inspecciona quemaduras solares (manchas blanquecinas en lámina foliar), hojas apergaminadas o desecación acelerada del cepellón.';
      defaultTag = `🔥 Control Ola Calor (${risks.maxTemp}°C)`;
      defaultNoteOk = `Excelente turgencia a pesar de los ${risks.maxTemp}°C. Maceta bien hidratada.`;
      defaultNoteWarn = `Hojas curvadas hacia arriba y leve marchitamiento estival reversible.`;
      defaultNoteDang = `Quemaduras solares en bordes y caída prematura de flores o frutos tiernos.`;
    }

    let selectedDamage = 'ok'; // 'ok' | 'warn' | 'danger'
    let compressedPhotoData = null;

    container.innerHTML = `
      <div class="modal-overlay active" id="climate-control-modal">
        <div class="modal-content" style="max-width: 580px;">
          <div class="modal-header">
            <h3 class="modal-title">📷 Foto de Control tras Alertas Climáticas</h3>
            <button class="modal-close" id="btn-close-climate-modal">&times;</button>
          </div>

          <!-- EVENT CONTEXT BANNER -->
          <div style="background: rgba(255,255,255,0.03); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:0.85rem; display:flex; flex-direction:column; gap:0.45rem;">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
              <strong style="color:#ffffff; font-size:0.9rem;">${eventTitle}</strong>
              <span class="climate-event-badge ${eventBadgeClass}">${eventBadgeText}</span>
            </div>
            <p style="font-size:0.75rem; color:#cbd5e1; line-height:1.4; margin:0;">
              ${eventAdvice}
            </p>
          </div>

          <form id="climate-control-form" style="display:flex; flex-direction:column; gap:0.9rem; margin-top:0.4rem;">
            <!-- SELECT POT -->
            <div class="form-group">
              <label class="form-label" for="select-climate-pot">Maceta a auditar:</label>
              <select id="select-climate-pot" class="form-select">
                ${pots.map(p => `
                  <option value="${p.id}" ${p.id === activePotId ? 'selected' : ''}>
                    ${p.name}
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- DAMAGE LEVEL SELECTOR -->
            <div class="form-group">
              <label class="form-label">Evaluación de Daños Foliares:</label>
              <div class="damage-selector-grid">
                <div class="damage-option-pill selected" data-damage="ok">
                  <span style="font-size:1.3rem;">🟢</span>
                  <span class="damage-pill-title">Sin Daños</span>
                  <span class="damage-pill-desc">Hojas vivas y turgentes</span>
                </div>
                <div class="damage-option-pill" data-damage="warn">
                  <span style="font-size:1.3rem;">🟡</span>
                  <span class="damage-pill-title">Estrés Leve</span>
                  <span class="damage-pill-desc">Puntas secas o flacidez</span>
                </div>
                <div class="damage-option-pill" data-damage="danger">
                  <span style="font-size:1.3rem;">🔴</span>
                  <span class="damage-pill-title">Daño Visible</span>
                  <span class="damage-pill-desc">Necrosis o quemaduras</span>
                </div>
              </div>
            </div>

            <!-- PHOTO UPLOAD -->
            <div class="form-group">
              <label class="form-label">📸 Capturar Foto de Control:</label>
              <div style="display:flex; align-items:center; gap:0.75rem;">
                <div class="file-input-wrapper">
                  <button class="btn btn-sm btn-water" type="button">
                    📷 Cámara o Galería
                  </button>
                  <input type="file" id="input-climate-photo" accept="image/*" capture="environment" />
                </div>
                <div id="climate-photo-preview-wrap" class="photo-preview-wrap" style="display:none;">
                  <img id="climate-photo-preview-img" src="" alt="Previsualización" />
                </div>
              </div>
            </div>

            <!-- NOTES / OBSERVATIONS -->
            <div class="form-group">
              <label class="form-label" for="input-climate-notes">Notas del diagnóstico botánico:</label>
              <input type="text" id="input-climate-notes" class="form-input" value="${defaultNoteOk}" />
            </div>

            <label class="form-checkbox-row">
              <input type="checkbox" id="check-climate-cover" />
              <span>Establecer como foto de portada principal de la maceta</span>
            </label>

            <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.4rem;">
              <button type="button" class="btn" id="btn-cancel-climate">Cancelar</button>
              <button type="submit" class="btn btn-primary" id="btn-submit-climate-photo">
                💾 Guardar Foto de Control
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.getElementById('btn-close-climate-modal')?.addEventListener('click', () => { container.innerHTML = ''; });
    document.getElementById('btn-cancel-climate')?.addEventListener('click', () => { container.innerHTML = ''; });

    // Damage pills click handling
    const notesInput = document.getElementById('input-climate-notes');
    const pills = container.querySelectorAll('.damage-option-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('selected', 'damage-warning', 'damage-danger'));
        pill.classList.add('selected');
        selectedDamage = pill.dataset.damage;

        if (selectedDamage === 'warn') {
          pill.classList.add('damage-warning');
          if (notesInput) notesInput.value = defaultNoteWarn;
        } else if (selectedDamage === 'danger') {
          pill.classList.add('damage-danger');
          if (notesInput) notesInput.value = defaultNoteDang;
        } else {
          if (notesInput) notesInput.value = defaultNoteOk;
        }
      });
    });

    // File input change with auto compression
    const photoInput = document.getElementById('input-climate-photo');
    photoInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          const res = await photoDb.compressImage(file);
          compressedPhotoData = res.dataUrl;

          const previewWrap = document.getElementById('climate-photo-preview-wrap');
          const previewImg = document.getElementById('climate-photo-preview-img');
          if (previewWrap && previewImg) {
            previewImg.src = res.dataUrl;
            previewWrap.style.display = 'block';
          }
        } catch (err) {
          console.warn('Error comprimiendo foto:', err);
        }
      }
    });

    // Submit handler
    document.getElementById('climate-control-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const potId = document.getElementById('select-climate-pot')?.value;
      const notes = notesInput?.value?.trim() || defaultTag;
      const isCover = document.getElementById('check-climate-cover')?.checked ?? false;

      if (!potId) return;

      if (!compressedPhotoData) {
        alert('Por favor, selecciona o saca una foto para registrar el control foliar.');
        return;
      }

      const damageEmoji = selectedDamage === 'ok' ? '🟢' : selectedDamage === 'warn' ? '🟡' : '🔴';
      const fullNote = `${damageEmoji} ${notes}`;

      await photoDb.addPhoto({
        potId,
        dataUrl: compressedPhotoData,
        note: fullNote,
        tag: defaultTag,
        isCover
      });

      audioService.playChime();
      this.showToast(`¡Foto de control registrada para ${db.getPot(potId)?.name || 'la maceta'}! 📸`, 'success');

      container.innerHTML = '';
      await this.refreshData();
      this.render();
    });
  }

  // ================= MODAL DE FOTOS & EVOLUCIÓN BOTÁNICA ================= //

  async openPhotosModal(potId) {
    const container = document.getElementById('modal-container');
    if (!container) return;

    const pot = db.getPot(potId);
    if (!pot) return;

    const photos = await photoDb.getPhotosByPot(potId);

    // Identificar fotos marcadas como instrucciones/etiqueta
    const instructionPhotos = photos.filter(p => 
      p.isInstruction || (p.tag && p.tag.includes('Etiqueta')) || (p.note && (p.note.includes('Etiqueta') || p.note.includes('Instrucciones')))
    );

    // Fotos de evolución/progreso botánico (todas excepto las que son puramente instrucciones)
    const evolutionPhotos = photos.filter(p => !instructionPhotos.some(ip => ip.id === p.id));
    const initialPhoto = await photoDb.getInitialPhoto(potId);
    const newest = evolutionPhotos[0] || photos[0];

    // Helper para determinar clase CSS del collage según cantidad de fotos
    const getCollageClass = (count) => {
      if (count === 1) return 'collage-grid-1';
      if (count === 2) return 'collage-grid-2';
      if (count === 3) return 'collage-grid-3';
      if (count === 4) return 'collage-grid-4';
      return 'collage-grid-multi';
    };

    // Bloque Collage 1: Instrucciones y Etiquetas (soporta 1 o múltiples fotos)
    let instructionsHtml = '';
    if (instructionPhotos.length > 0) {
      instructionsHtml = `
        <div class="instructions-section-box">
          <div class="instructions-section-header">
            <strong style="color:#fcd34d; font-size:0.85rem; display:flex; align-items:center; gap:0.4rem;">
              🏷️ Fichas, Etiquetas & Instrucciones (${instructionPhotos.length})
            </strong>
            <span class="tag tag-photo-label" style="font-size:0.68rem;">Collage de cuidados</span>
          </div>
          <div class="${getCollageClass(instructionPhotos.length)}">
            ${instructionPhotos.map(photo => {
              const dStr = new Date(photo.date).toLocaleDateString('es-ES', { day:'numeric', month:'short' });
              return `
                <div class="collage-item btn-view-full-photo" data-img="${photo.dataUrl}" data-title="${photo.note || 'Instrucciones'} (${dStr})" title="Toca para ampliar foto">
                  <img src="${photo.dataUrl}" alt="Instrucción / Etiqueta" loading="lazy" />
                  <div class="collage-item-badge">🏷️ ${photo.note || 'Instrucciones'}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    // Bloque Collage 2: Comparativa de Crecimiento & Evolución (Antes vs Hoy / Collage)
    let comparisonHtml = '';
    if (evolutionPhotos.length >= 2) {
      const oldestEvol = evolutionPhotos[evolutionPhotos.length - 1];
      const newestEvol = evolutionPhotos[0];
      const daysDiff = Math.max(0, Math.round((new Date(newestEvol.date) - new Date(oldestEvol.date)) / (1000 * 60 * 60 * 24)));

      comparisonHtml = `
        <div class="comparison-box">
          <div class="comparison-header">
            <strong style="color:#ffffff; font-size:0.85rem;">🔄 Evolución y Crecimiento (${evolutionPhotos.length} fotos)</strong>
            <span class="tag tag-covered">⏳ ${daysDiff} días de evolución</span>
          </div>
          <div class="${getCollageClass(Math.min(evolutionPhotos.length, 4))}">
            ${evolutionPhotos.slice(0, 4).map((photo, idx) => {
              const isOldest = idx === evolutionPhotos.slice(0, 4).length - 1;
              const isNew = idx === 0;
              const badgeLabel = isNew ? 'Actual' : isOldest ? 'Inicio' : 'Evolución';
              const badgeColor = isNew ? '#10b981' : isOldest ? '#3b82f6' : 'rgba(0,0,0,0.7)';
              const dStr = new Date(photo.date).toLocaleDateString('es-ES', { day:'numeric', month:'short', year:'numeric' });
              return `
                <div class="collage-item btn-view-full-photo" data-img="${photo.dataUrl}" data-title="Evolución (${dStr})" title="Toca para ampliar foto">
                  <img src="${photo.dataUrl}" alt="Evolución ${dStr}" loading="lazy" />
                  <span class="comparison-badge" style="background:${badgeColor}; font-size:0.65rem;">${badgeLabel}</span>
                  <div class="collage-item-badge">${dStr}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    const PHOTO_TYPE_OPTIONS = [
      { value: 'Progreso habitual', label: '🌱 Progreso habitual' },
      { value: '🏷️ Etiqueta / Instrucciones de cuidado', label: '🏷️ Etiqueta / Instrucciones' },
      { value: 'Primer brote', label: '🌿 Primer brote' },
      { value: 'Floración', label: '🌸 Floración' },
      { value: 'Aparición de frutos', label: '🍅 Aparición de frutos' },
      { value: 'Trasplante de maceta', label: '🪴 Trasplante de maceta' },
      { value: 'Poda o pinzado', label: '✂️ Poda o pinzado' },
      { value: 'Abonado', label: '🧪 Abonado' },
      { value: 'Resistencia tras helada', label: '❄️ Tras la helada' },
      { value: 'Control tras ola de calor', label: '🔥 Tras ola de calor' },
      { value: 'Control tras temporal', label: '⛈️ Tras el temporal' }
    ];

    container.innerHTML = `
      <div class="modal-overlay active" id="photos-modal">
        <div class="modal-content photo-modal-content">
          <div class="modal-header">
            <h3 class="modal-title">📸 Galería & Evolución: ${pot.name}</h3>
            <button class="modal-close" id="btn-close-photos-modal">&times;</button>
          </div>

          <!-- UPLOAD NEW PHOTO BOX -->
          <div class="photo-upload-box">
            <strong style="font-size:0.82rem; color:#ffffff;">➕ Añadir Foto a la Línea de Tiempo:</strong>
            <div class="photo-upload-row">
              <div class="file-input-wrapper">
                <button class="btn btn-sm btn-water" type="button">
                  📷 Capturar / Seleccionar Foto
                </button>
                <input type="file" id="input-new-photo" accept="image/*" capture="environment" />
              </div>

              <select id="select-photo-note" class="form-select" style="font-size:0.75rem; padding:0.35rem 0.5rem; flex:1; min-width:160px;">
                ${PHOTO_TYPE_OPTIONS.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
              </select>

              <button class="btn btn-sm btn-primary" id="btn-save-photo" disabled>
                Guardar Foto
              </button>
            </div>

            <div id="new-photo-preview-wrap" class="photo-preview-wrap" style="align-self:flex-start;">
              <img id="new-photo-preview-img" src="" alt="Previsualización" />
            </div>
          </div>

          <!-- BLOQUE 1: INSTRUCCIONES / ETIQUETAS (COLLAGE MULTI-FOTO) -->
          ${instructionsHtml}

          <!-- BLOQUE 2: COMPARATIVA / COLLAGE DE EVOLUCIÓN (ANTES VS HOY) -->
          ${comparisonHtml}

          <!-- PHOTOS TIMELINE LIST -->
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem;">
              <strong style="font-size:0.85rem; color:#ffffff;">Todas las Fotos (${photos.length})</strong>
              <span style="font-size:0.72rem; color:var(--text-muted);">Elige portada, pulsa "🏷️ Instrucciones" o cambia el tipo</span>
            </div>

            <div class="photos-timeline" id="photos-timeline-grid">
              ${photos.length > 0 ? photos.map(photo => {
                const dateStr = new Date(photo.date).toLocaleDateString('es-ES', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                });

                const isInstruction = Boolean(
                  photo.isInstruction || 
                  (photo.tag && photo.tag.includes('Etiqueta')) || 
                  (photo.note && (photo.note.includes('Etiqueta') || photo.note.includes('Instrucciones')))
                );

                const matchingOption = PHOTO_TYPE_OPTIONS.find(opt => opt.value === photo.note || (photo.note && photo.note.includes('Etiqueta') && opt.value.includes('Etiqueta')));
                const selectedVal = matchingOption ? matchingOption.value : (photo.note || 'Progreso habitual');

                return `
                  <div class="photo-card" id="photo-card-${photo.id}">
                    <div class="photo-card-img-wrap">
                      <img src="${photo.dataUrl}" alt="Foto ${dateStr}" loading="lazy" />
                      ${photo.isCover ? '<span class="photo-card-cover-badge">★ Portada</span>' : ''}
                      ${isInstruction ? '<span class="photo-card-instruction-badge">🏷️ Instrucción</span>' : ''}
                    </div>
                    <div class="photo-card-info">
                      <div>
                        <div class="photo-date">${dateStr}</div>
                        ${photo.tag && !isInstruction ? `<div class="tag tag-climate-control" style="font-size:0.65rem; margin-top:0.2rem; display:inline-block;">${photo.tag}</div>` : ''}
                        ${isInstruction ? `<div class="tag tag-photo-label" style="font-size:0.65rem; margin-top:0.2rem; display:inline-block;">🏷️ Etiqueta / Instrucciones</div>` : ''}
                      </div>

                      <div style="margin-top:0.35rem;">
                        <label style="font-size:0.68rem; color:var(--text-muted); display:block; margin-bottom:0.2rem;">Tipo de foto:</label>
                        <select class="form-select select-photo-type-existing" data-id="${photo.id}" style="font-size:0.72rem; padding:0.25rem 0.4rem; width:100%;">
                          ${PHOTO_TYPE_OPTIONS.map(opt => `
                            <option value="${opt.value}" ${opt.value === selectedVal ? 'selected' : ''}>
                              ${opt.label}
                            </option>
                          `).join('')}
                          ${!matchingOption && photo.note ? `<option value="${photo.note}" selected>${photo.note}</option>` : ''}
                        </select>
                      </div>

                      <div class="photo-card-actions">
                        ${!photo.isCover ? `
                          <button class="btn btn-sm btn-make-cover" data-id="${photo.id}" title="Usar como portada principal de la maceta">
                            ★ Portada
                          </button>
                        ` : ''}
                        <button class="btn btn-sm btn-make-instruction ${isInstruction ? 'active' : ''}" data-id="${photo.id}" title="${isInstruction ? 'Quitar de bloque de instrucciones' : 'Marcar para bloque de instrucciones/etiqueta'}">
                          ${isInstruction ? '✓ Es Instrucción' : '🏷️ Instrucciones'}
                        </button>
                        <button class="btn btn-sm btn-danger btn-delete-photo" data-id="${photo.id}" title="Eliminar esta foto">
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                `;
              }).join('') : `
                <div style="grid-column: 1/-1; text-align: center; padding: 2.5rem; color: var(--text-muted); font-size:0.82rem;">
                  Aún no has tomado fotos de esta maceta.<br>¡Haz la primera foto para empezar a ver su crecimiento!
                </div>
              `}
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-close-photos-modal')?.addEventListener('click', () => { container.innerHTML = ''; });

    // Click en collage para ver foto ampliada
    document.querySelectorAll('.btn-view-full-photo').forEach(elem => {
      elem.addEventListener('click', () => {
        const imgUrl = elem.dataset.img;
        const title = elem.dataset.title;
        if (imgUrl) {
          const w = window.open('');
          if (w) {
            w.document.write(`
              <html>
                <head><title>${title || 'Foto'}</title></head>
                <body style="margin:0; background:#0f172a; display:flex; align-items:center; justify-content:center; height:100vh;">
                  <img src="${imgUrl}" style="max-width:95vw; max-height:95vh; object-fit:contain; border-radius:8px; box-shadow:0 8px 30px rgba(0,0,0,0.7);" />
                </body>
              </html>
            `);
          }
        }
      });
    });

    const fileInput = document.getElementById('input-new-photo');
    const saveBtn = document.getElementById('btn-save-photo');
    let pendingCompressed = null;

    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          saveBtn.innerText = 'Comprimiendo...';
          const res = await photoDb.compressImage(file);
          pendingCompressed = res.dataUrl;

          const previewWrap = document.getElementById('new-photo-preview-wrap');
          const previewImg = document.getElementById('new-photo-preview-img');
          if (previewWrap && previewImg) {
            previewImg.src = res.dataUrl;
            previewWrap.style.display = 'block';
          }

          saveBtn.disabled = false;
          saveBtn.innerText = 'Guardar Foto';
        } catch (err) {
          alert('Error procesando imagen: ' + err.message);
          saveBtn.disabled = true;
          saveBtn.innerText = 'Guardar Foto';
        }
      }
    });

    saveBtn?.addEventListener('click', async () => {
      if (!pendingCompressed) return;
      const note = document.getElementById('select-photo-note')?.value || '';
      const isLabel = note.includes('Etiqueta') || note.includes('Instrucciones');
      saveBtn.disabled = true;
      saveBtn.innerText = 'Guardando...';

      const isFirst = photos.length === 0;

      await photoDb.addPhoto({
        potId,
        dataUrl: pendingCompressed,
        note,
        tag: isLabel ? 'Etiqueta/Instrucciones' : '',
        date: new Date().toISOString(),
        isCover: isFirst,
        isInstruction: isLabel,
        isInitial: isFirst && !isLabel
      });

      this.showToast('Foto añadida a la maceta 📸', 'success');
      await this.refreshData();
      this.render();
      this.openPhotosModal(potId);
    });

    // Modificar tipo de foto de fotos existentes
    document.querySelectorAll('.select-photo-type-existing').forEach(select => {
      select.addEventListener('change', async () => {
        const photoId = select.dataset.id;
        const newNote = select.value;
        const isLabel = newNote.includes('Etiqueta') || newNote.includes('Instrucciones');
        await photoDb.updatePhoto(photoId, {
          note: newNote,
          isInstruction: isLabel,
          tag: isLabel ? 'Etiqueta/Instrucciones' : ''
        });
        this.showToast('Tipo de foto actualizado 🏷️', 'success');
        await this.refreshData();
        this.render();
        this.openPhotosModal(potId);
      });
    });

    document.querySelectorAll('.btn-make-cover').forEach(btn => {
      btn.addEventListener('click', async () => {
        const photoId = btn.dataset.id;
        await photoDb.setCoverPhoto(potId, photoId);
        this.showToast('Foto de portada actualizada ★', 'success');
        await this.refreshData();
        this.render();
        this.openPhotosModal(potId);
      });
    });

    // Botón para alternar foto como Instrucciones / Etiquetas
    document.querySelectorAll('.btn-make-instruction').forEach(btn => {
      btn.addEventListener('click', async () => {
        const photoId = btn.dataset.id;
        await photoDb.toggleInstructionPhoto(photoId);
        this.showToast('Bloque de instrucciones actualizado 🏷️', 'success');
        await this.refreshData();
        this.render();
        this.openPhotosModal(potId);
      });
    });

    document.querySelectorAll('.btn-delete-photo').forEach(btn => {
      btn.addEventListener('click', async () => {
        const photoId = btn.dataset.id;
        if (confirm('¿Seguro que deseas eliminar esta foto?')) {
          await photoDb.deletePhoto(photoId);
          this.showToast('Foto eliminada', 'info');
          await this.refreshData();
          this.render();
          this.openPhotosModal(potId);
        }
      });
    });
  }

  // ================= MODAL DE EDICIÓN RÁPIDA DE NOMBRE ================= //

  openQuickRenameModal(potId, currentName) {
    const container = document.getElementById('modal-container');
    if (!container) return;

    container.innerHTML = `
      <div class="modal-overlay active" id="quick-rename-modal">
        <div class="modal-content" style="max-width: 440px;">
          <div class="modal-header">
            <h3 class="modal-title">✏️ Renombrar Planta</h3>
            <button class="modal-close" id="btn-close-rename-modal">&times;</button>
          </div>

          <form id="quick-rename-form" style="display:flex; flex-direction:column; gap:1rem;">
            <div class="form-group">
              <label class="form-label" for="input-quick-name">Nombre de la Planta:</label>
              <input type="text" id="input-quick-name" class="form-input" required value="${currentName}" autocomplete="off" />
            </div>

            <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
              <button type="button" class="btn btn-sm" id="btn-cancel-rename">Cancelar</button>
              <button type="submit" class="btn btn-primary btn-sm">Guardar Nombre</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const input = document.getElementById('input-quick-name');
    if (input) {
      input.focus();
      input.select();
    }

    document.getElementById('btn-close-rename-modal')?.addEventListener('click', () => { container.innerHTML = ''; });
    document.getElementById('btn-cancel-rename')?.addEventListener('click', () => { container.innerHTML = ''; });

    document.getElementById('quick-rename-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newName = document.getElementById('input-quick-name').value.trim();
      if (!newName) return;

      db.updatePot(potId, { name: newName });
      this.showToast(`Nombre actualizado a "${newName}" ✏️`, 'success');
      container.innerHTML = '';
      await this.refreshData();
      this.render();
    });
  }

  // ================= MODAL CONFIRMACIÓN DE RIEGO CON AJUSTE Y FEEDBACK ================= //

  async openWaterConfirmationModal(potId) {
    const container = document.getElementById('modal-container');
    if (!container) return;

    const pot = db.getPot(potId);
    if (!pot) return;

    if (pot.containerId && !pot.container) {
      pot.container = (this.containers || db.getContainers()).find(c => c.id === pot.containerId) || null;
    }

    const currentDose = this.potDoses[potId] || await wasmEngineService.calculateDose(pot, this.weatherData);
    let selectedGlasses = currentDose.doseGlasses || 2.0;

    const renderDoseValue = () => {
      const glassesEl = document.getElementById('water-confirm-glasses');
      const mlEl = document.getElementById('water-confirm-ml');
      const feedbackNoteEl = document.getElementById('water-confirm-note');
      const approxMl = Math.round(selectedGlasses * 250);

      if (glassesEl) glassesEl.innerText = `${selectedGlasses} vasos`;
      if (mlEl) mlEl.innerText = `~${approxMl} ml`;

      if (feedbackNoteEl) {
        const diff = selectedGlasses - currentDose.doseGlasses;
        if (diff < -0.2) {
          feedbackNoteEl.innerHTML = `<span style="color:#38bdf8;">📉 <strong>Riego reducido:</strong> Se calibrará el motor para adaptar el factor de retención hídrica.</span>`;
        } else if (diff > 0.2) {
          feedbackNoteEl.innerHTML = `<span style="color:#f59e0b;">📈 <strong>Riego incrementado:</strong> Dosis superior a la sugerida.</span>`;
        } else {
          feedbackNoteEl.innerHTML = `<span style="color:#10b981;">✨ Dosis óptima recomendada por el algoritmo agronómico.</span>`;
        }
      }
    };

    container.innerHTML = `
      <div class="modal-overlay active" id="water-confirm-modal">
        <div class="modal-content" style="max-width: 480px;">
          <div class="modal-header">
            <h3 class="modal-title">💧 Confirmar Riego: ${pot.name}</h3>
            <button class="modal-close" id="btn-close-water-confirm">&times;</button>
          </div>

          <div style="font-size:0.85rem; color:var(--text-muted); line-height:1.4;">
            ${pot.container ? `<p style="margin-bottom:0.4rem;"><span class="tag tag-container-parent">🪴 ${pot.container.name}</span></p>` : ''}
            Dosis calculada por el motor agronómico: <strong>${currentDose.doseGlasses} vasos (~${currentDose.doseMl} ml)</strong>.
            Si decides regar menos o más, ajusta la cantidad real y el motor aprenderá de este aporte.
          </div>

          <!-- DOSIS STEPPER -->
          <div class="dose-adjust-group">
            <button type="button" class="dose-stepper-btn" id="btn-step-minus" title="Reducir medio vaso">−</button>
            <div class="dose-display-badge">
              <span class="dose-glasses-val" id="water-confirm-glasses">${selectedGlasses} vasos</span>
              <span class="dose-ml-val" id="water-confirm-ml">~${Math.round(selectedGlasses * 250)} ml</span>
            </div>
            <button type="button" class="dose-stepper-btn" id="btn-step-plus" title="Aumentar medio vaso">+</button>
          </div>

          <!-- PRESETS RÁPIDOS -->
          <div class="dose-quick-preset-row">
            <button type="button" class="btn btn-sm btn-preset-dose" data-ratio="0.5">50% (-mitad)</button>
            <button type="button" class="btn btn-sm btn-preset-dose" data-ratio="0.75">75% (moderado)</button>
            <button type="button" class="btn btn-sm btn-preset-dose" data-ratio="1.0">100% (recomendada)</button>
            <button type="button" class="btn btn-sm btn-preset-dose" data-ratio="1.25">125% (+extra)</button>
          </div>

          <div id="water-confirm-note" style="font-size:0.75rem; text-align:center; min-height:1.4rem; margin-bottom:0.75rem;"></div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem; border-top:1px solid var(--border-subtle); padding-top:0.75rem;">
            <button type="button" class="btn btn-sm" id="btn-cancel-water-confirm">Cancelar</button>
            <button type="button" class="btn btn-water" id="btn-submit-water-confirm">
              💧 Regar y Registrar Aporte
            </button>
          </div>
        </div>
      </div>
    `;

    renderDoseValue();

    document.getElementById('btn-close-water-confirm')?.addEventListener('click', () => { container.innerHTML = ''; });
    document.getElementById('btn-cancel-water-confirm')?.addEventListener('click', () => { container.innerHTML = ''; });

    document.getElementById('btn-step-minus')?.addEventListener('click', () => {
      if (selectedGlasses > 0.5) {
        selectedGlasses = Math.round((selectedGlasses - 0.5) * 2) / 2;
        renderDoseValue();
      }
    });

    document.getElementById('btn-step-plus')?.addEventListener('click', () => {
      if (selectedGlasses < 20) {
        selectedGlasses = Math.round((selectedGlasses + 0.5) * 2) / 2;
        renderDoseValue();
      }
    });

    document.querySelectorAll('.btn-preset-dose').forEach(btn => {
      btn.addEventListener('click', () => {
        const ratio = parseFloat(btn.dataset.ratio);
        const base = currentDose.doseGlasses || 2.0;
        selectedGlasses = Math.max(0.5, Math.round((base * ratio) * 2) / 2);
        renderDoseValue();
      });
    });

    document.getElementById('btn-submit-water-confirm')?.addEventListener('click', async () => {
      const actualMl = Math.round(selectedGlasses * 250);
      const isReduced = selectedGlasses < currentDose.doseGlasses - 0.2;
      const isExtra = selectedGlasses > currentDose.doseGlasses + 0.2;

      audioService.playWaterDropSound();

      // Si el usuario decidió regar menos conscientemente, alimentar al modelo adaptativo
      if (isReduced || isExtra) {
        try {
          const feedback = {
            daysElapsed: 2.0,
            observedMoistureLevel: isReduced ? 2 : 1,
            waterGivenGlasses: selectedGlasses,
            meanTempObserved: this.weatherData?.currentTemp ?? 22.0
          };
          const calib = await wasmEngineService.calibrateWithFingerTest(pot, feedback);
          if (calib && calib.success) {
            db.updatePot(potId, {
              learnedDryingFactor: calib.newLearnedDryingFactor,
              calibratedDoseMl: actualMl,
              calibrationCount: (pot.calibrationCount || 0) + 1
            });
          }
        } catch (err) {
          console.warn('Error en calibración por riego personalizado:', err);
        }
      }

      const noteText = isReduced
        ? `Riego reducido voluntariamente: ${selectedGlasses} vasos (~${actualMl} ml) [Ajuste adaptativo]`
        : (isExtra ? `Riego extra: ${selectedGlasses} vasos (~${actualMl} ml)` : `Riego óptimo: ${selectedGlasses} vasos`);

      db.recordWatering(potId, new Date().toISOString(), noteText);

      this.showToast(`¡Riego de ${selectedGlasses} vasos registrado para ${pot.name}! 💧`, 'success');
      container.innerHTML = '';
      await this.refreshData();
      this.render();
    });
  }

  // ================= MODAL GESTOR DE JARDINERAS CORRIDAS (CONTENEDORES PADRE) ================= //

  openContainersModal() {
    const container = document.getElementById('modal-container');
    if (!container) return;

    const containers = db.getContainers();
    const pots = db.getPots();

    container.innerHTML = `
      <div class="modal-overlay active" id="containers-modal">
        <div class="modal-content" style="max-width: 650px;">
          <div class="modal-header">
            <h3 class="modal-title">🪴 Jardineras Corridas & Contenedores Padre</h3>
            <button class="modal-close" id="btn-close-containers-modal">&times;</button>
          </div>

          <p style="font-size:0.82rem; color:var(--text-muted); line-height:1.4;">
            Una jardinera corrida alberga varias plantas distintas compartiendo un volumen grande de tierra.
            El motor agronómico divide el volumen entre las secciones y aplica la mayor inercia térmica contra el secado.
          </p>

          <!-- LISTA DE JARDINERAS EXISTENTES -->
          <div style="display:flex; flex-direction:column; gap:0.75rem; margin:1rem 0;" id="containers-list">
            ${containers.length > 0 ? containers.map(c => {
              const assignedPlants = pots.filter(p => p.containerId === c.id);
              const perSectionLiters = Math.round((c.totalLiters / (c.sections || 1)) * 10) / 10;
              return `
                <div class="container-card" id="container-card-${c.id}">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                      <strong style="color:#ffffff; font-size:0.95rem;">🪴 ${c.name}</strong>
                      <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.2rem;">
                        ${c.totalLiters} L totales • ${c.sections} secciones (~${perSectionLiters} L/sección) • ${c.material === 'terracotta' ? 'Barro' : 'Plástico'} • ${c.isCovered ? 'Techada' : 'Cielo Abierto'}${c.dimensions ? ` • 📏 ${c.dimensions.length}×${c.dimensions.width}×${c.dimensions.depth} cm` : ''}
                      </div>
                    </div>
                    <div style="display:flex; gap:0.4rem;">
                      <button class="btn btn-sm btn-delete-container" data-id="${c.id}" title="Eliminar jardinera">🗑️</button>
                    </div>
                  </div>

                  ${c.notes ? `<div style="font-size:0.75rem; color:#cbd5e1; font-style:italic;">"${c.notes}"</div>` : ''}

                  <div>
                    <span style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">Plantas alojadas (${assignedPlants.length} de ${c.sections}):</span>
                    <div class="container-plants-list">
                      ${assignedPlants.length > 0 ? assignedPlants.map(p => `
                        <span class="tag tag-container-parent" style="font-size:0.7rem;">🌿 ${p.name}</span>
                      `).join('') : `<span style="font-size:0.7rem; color:var(--text-muted);">Sin plantas asignadas aún. Asígnalas al crear o editar una planta.</span>`}
                    </div>
                  </div>
                </div>
              `;
            }).join('') : `
              <div style="text-align:center; padding:1.5rem; color:var(--text-muted); font-size:0.8rem;">
                No hay jardineras creadas todavía. Crea una a continuación para alojar varias plantas.
              </div>
            `}
          </div>

          <!-- FORMULARIO NUEVA JARDINERA -->
          <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:0.85rem;">
            <strong style="font-size:0.85rem; color:#ffffff; display:block; margin-bottom:0.6rem;">➕ Dar de alta nueva Jardinera Corrida:</strong>
            <form id="new-container-form" style="display:flex; flex-direction:column; gap:0.75rem;">
              <div class="form-group">
                <label class="form-label" for="input-container-name">Nombre de la Jardinera:</label>
                <input type="text" id="input-container-name" class="form-input" required placeholder="Ej: Jardinera Corrida Balcón Este (80cm)" />
              </div>

              <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:var(--radius-sm); padding:0.65rem; display:flex; flex-direction:column; gap:0.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:0.75rem; font-weight:700; color:#ffffff;">📏 Dimensiones de la Jardinera (cm):</span>
                  <span id="dimensions-calc-badge" style="font-size:0.72rem; color:#34d399; font-weight:700; background:rgba(16,185,129,0.15); padding:0.15rem 0.5rem; border-radius:var(--radius-full); border:1px solid rgba(16,185,129,0.3);">
                    📐 Calculado: ~40 L
                  </span>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.5rem;">
                  <div class="form-group" style="margin:0;">
                    <label class="form-label" for="input-dim-length" style="font-size:0.7rem;">Largo (cm):</label>
                    <input type="number" id="input-dim-length" class="form-input" min="10" max="300" placeholder="Ej: 80" value="80" style="padding:0.35rem 0.5rem; font-size:0.8rem;" />
                  </div>
                  <div class="form-group" style="margin:0;">
                    <label class="form-label" for="input-dim-width" style="font-size:0.7rem;">Ancho (cm):</label>
                    <input type="number" id="input-dim-width" class="form-input" min="10" max="150" placeholder="Ej: 25" value="25" style="padding:0.35rem 0.5rem; font-size:0.8rem;" />
                  </div>
                  <div class="form-group" style="margin:0;">
                    <label class="form-label" for="input-dim-depth" style="font-size:0.7rem;">Profundidad (cm):</label>
                    <input type="number" id="input-dim-depth" class="form-input" min="10" max="150" placeholder="Ej: 20" value="20" style="padding:0.35rem 0.5rem; font-size:0.8rem;" />
                  </div>
                </div>
                <span style="font-size:0.68rem; color:var(--text-muted); line-height:1.2;">
                  💡 El volumen se calcula como (Largo × Ancho × Profundidad) / 1000. Puedes ajustar los litros resultantes manualmente si tiene forma cónica o fondo irregular.
                </span>
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
                <div class="form-group">
                  <label class="form-label" for="input-container-liters">Volumen Total (Litros):</label>
                  <input type="number" id="input-container-liters" class="form-input" required min="5" max="500" step="0.5" value="40" />
                </div>
                <div class="form-group">
                  <label class="form-label" for="input-container-sections">Número de Secciones / Plantas:</label>
                  <input type="number" id="input-container-sections" class="form-input" required min="1" max="10" value="3" />
                </div>
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
                <div class="form-group">
                  <label class="form-label" for="select-container-material">Material:</label>
                  <select id="select-container-material" class="form-select">
                    <option value="terracotta">Barro cocido / Terracota</option>
                    <option value="plastic">Plástico / Resina</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="select-container-sun">Exposición:</label>
                  <select id="select-container-sun" class="form-select">
                    <option value="full_sun">Pleno Sol</option>
                    <option value="partial_sun" selected>Semisombra</option>
                    <option value="shade">Sombra</option>
                  </select>
                </div>
              </div>

              <label class="form-checkbox-row">
                <input type="checkbox" id="check-container-covered" checked />
                <span><strong>Bajo techo:</strong> La lluvia exterior no la empapa directamente.</span>
              </label>

              <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.25rem;">
                <button type="submit" class="btn btn-primary btn-sm">➕ Guardar Jardinera</button>
              </div>
            </form>
          </div>

          <div style="display:flex; justify-content:flex-end; margin-top:0.85rem;">
            <button type="button" class="btn" id="btn-close-containers-footer">Cerrar</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-close-containers-modal')?.addEventListener('click', () => { container.innerHTML = ''; });
    document.getElementById('btn-close-containers-footer')?.addEventListener('click', () => { container.innerHTML = ''; });

    // Cálculo automático de litros en vivo según dimensiones
    const dimL = document.getElementById('input-dim-length');
    const dimW = document.getElementById('input-dim-width');
    const dimD = document.getElementById('input-dim-depth');
    const litersInput = document.getElementById('input-container-liters');
    const badge = document.getElementById('dimensions-calc-badge');

    const updateCalculatedLiters = () => {
      const l = parseFloat(dimL?.value || 0);
      const w = parseFloat(dimW?.value || 0);
      const d = parseFloat(dimD?.value || 0);
      if (l > 0 && w > 0 && d > 0) {
        const calculatedLiters = Math.round(((l * w * d) / 1000) * 10) / 10;
        if (litersInput) litersInput.value = calculatedLiters;
        if (badge) badge.innerText = `📐 Calculado: ~${calculatedLiters} L`;
      }
    };

    dimL?.addEventListener('input', updateCalculatedLiters);
    dimW?.addEventListener('input', updateCalculatedLiters);
    dimD?.addEventListener('input', updateCalculatedLiters);

    document.getElementById('new-container-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('input-container-name').value.trim();
      const length = parseFloat(document.getElementById('input-dim-length')?.value || 0) || null;
      const width = parseFloat(document.getElementById('input-dim-width')?.value || 0) || null;
      const depth = parseFloat(document.getElementById('input-dim-depth')?.value || 0) || null;
      const totalLiters = parseFloat(document.getElementById('input-container-liters').value || '40');
      const sections = parseInt(document.getElementById('input-container-sections').value || '3', 10);
      const material = document.getElementById('select-container-material').value;
      const sunExposure = document.getElementById('select-container-sun').value;
      const isCovered = document.getElementById('check-container-covered').checked;

      db.addContainer({
        name,
        dimensions: (length && width && depth) ? { length, width, depth } : null,
        totalLiters,
        sections,
        material,
        sunExposure,
        isCovered
      });

      this.showToast(`¡Jardinera "${name}" creada con éxito! 🪴`, 'success');
      await this.refreshData();
      this.render();
      this.openContainersModal();
    });

    document.querySelectorAll('.btn-delete-container').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (confirm('¿Eliminar esta jardinera? Las plantas alojadas pasarán a ser individuales.')) {
          db.deleteContainer(id);
          this.showToast('Jardinera eliminada', 'info');
          await this.refreshData();
          this.render();
          this.openContainersModal();
        }
      });
    });
  }

  // ================= MODALS: TIMER, POT, CITY, APK ================= //

  openTimerModal(potName = 'Riego') {
    const container = document.getElementById('modal-container');
    if (!container) return;

    this.timerSeconds = 180;
    this.initialTimerSeconds = 180;
    this.clearIntervalTimer();

    container.innerHTML = `
      <div class="modal-overlay active" id="timer-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">⏱️ Temporizador: ${potName}</h3>
            <button class="modal-close" id="btn-close-timer">&times;</button>
          </div>

          <div class="timer-container">
            <div class="timer-circle-wrap">
              <svg class="timer-svg" viewBox="0 0 100 100">
                <circle class="timer-track" cx="50" cy="50" r="42"></circle>
                <circle class="timer-progress" id="timer-progress-ring" cx="50" cy="50" r="42" stroke-dasharray="264" stroke-dashoffset="0"></circle>
              </svg>
              <div class="timer-center-text">
                <div class="timer-digits" id="timer-display">03:00</div>
                <div class="timer-sublabel" id="timer-status-text">Listo</div>
              </div>
            </div>

            <div class="timer-presets">
              <button class="btn btn-sm timer-preset-btn" data-sec="60">1 min (Rápido)</button>
              <button class="btn btn-sm timer-preset-btn" data-sec="180">3 min (Regadera)</button>
              <button class="btn btn-sm timer-preset-btn" data-sec="300">5 min (Empapar)</button>
              <button class="btn btn-sm timer-preset-btn" data-sec="900">15 min (Inmersión)</button>
            </div>

            <div class="timer-controls">
              <button class="btn btn-water" id="btn-timer-start">▶️ Iniciar</button>
              <button class="btn" id="btn-timer-reset">🔄 Reiniciar</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-close-timer')?.addEventListener('click', () => {
      this.clearIntervalTimer();
      container.innerHTML = '';
    });

    const startBtn = document.getElementById('btn-timer-start');
    const resetBtn = document.getElementById('btn-timer-reset');

    document.querySelectorAll('.timer-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.clearIntervalTimer();
        this.timerSeconds = parseInt(btn.dataset.sec, 10);
        this.initialTimerSeconds = this.timerSeconds;
        this.updateTimerDisplay();
        if (startBtn) startBtn.innerHTML = '▶️ Iniciar';
      });
    });

    let isRunning = false;
    startBtn?.addEventListener('click', () => {
      if (isRunning) {
        this.clearIntervalTimer();
        isRunning = false;
        startBtn.innerHTML = '▶️ Reanudar';
        document.getElementById('timer-status-text').innerText = 'Pausado';
      } else {
        isRunning = true;
        startBtn.innerHTML = '⏸️ Pausar';
        document.getElementById('timer-status-text').innerText = 'En curso';
        this.runTimer(() => {
          isRunning = false;
          startBtn.innerHTML = '▶️ Iniciar';
        });
      }
    });

    resetBtn?.addEventListener('click', () => {
      this.clearIntervalTimer();
      isRunning = false;
      this.timerSeconds = this.initialTimerSeconds;
      this.updateTimerDisplay();
      if (startBtn) startBtn.innerHTML = '▶️ Iniciar';
      document.getElementById('timer-status-text').innerText = 'Listo';
    });
  }

  runTimer(onFinish) {
    this.clearIntervalTimer();
    this.timerInterval = setInterval(() => {
      this.timerSeconds--;
      this.updateTimerDisplay();

      if (this.timerSeconds <= 0) {
        this.clearIntervalTimer();
        audioService.playChime();
        notificationService.sendNotification('⏰ ¡Tiempo de Riego Completado!', {
          body: 'El temporizador de riego ha finalizado. Cierra el grifo o retira la maceta del plato.',
          tag: 'timer-complete'
        });
        document.getElementById('timer-status-text').innerText = '¡COMPLETO!';
        this.showToast('¡Tiempo cumplido! 🔔', 'success');
        if (onFinish) onFinish();
      }
    }, 1000);
  }

  updateTimerDisplay() {
    const mins = Math.floor(this.timerSeconds / 60);
    const secs = this.timerSeconds % 60;
    const str = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    const displayEl = document.getElementById('timer-display');
    if (displayEl) displayEl.innerText = str;

    const ring = document.getElementById('timer-progress-ring');
    if (ring && this.initialTimerSeconds > 0) {
      const circumference = 264;
      const progress = (this.timerSeconds / this.initialTimerSeconds);
      const offset = circumference * (1 - progress);
      ring.style.strokeDashoffset = offset;
    }
  }

  clearIntervalTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  openPotModal(editId = null) {
    const container = document.getElementById('modal-container');
    if (!container) return;

    this.editingPotId = editId;
    const isEdit = Boolean(editId);
    const pot = isEdit ? db.getPot(editId) : {
      name: '',
      plantType: 'flowering',
      material: 'terracotta',
      size: 'medium',
      sunExposure: 'full_sun',
      isCovered: false,
      notes: ''
    };

    const existingCover = editId ? this.potCovers[editId] : null;

    container.innerHTML = `
      <div class="modal-overlay active" id="pot-modal">
        <div class="modal-content" style="max-width: 620px;">
          <div class="modal-header">
            <h3 class="modal-title">${isEdit ? '✏️ Editar Maceta' : '➕ Añadir Nueva Maceta'}</h3>
            <button class="modal-close" id="btn-close-pot-modal">&times;</button>
          </div>

          <form id="pot-form" style="display:flex; flex-direction:column; gap:1rem;">
            <!-- ASISTENTE BOTÁNICO (100 ESPECIES ESPAÑA + WIKIPEDIA + OPENFARM) -->
            <div class="botanical-assistant-banner" id="btn-toggle-plant-assistant" role="button" tabindex="0">
              <div class="botanical-banner-left">
                <span class="botanical-banner-icon">🌿</span>
                <div>
                  <strong class="botanical-banner-title">Catálogo España (100 especies) & Wikipedia / OpenFarm</strong>
                  <span class="botanical-banner-subtitle">Autocompletar especie, cuidados botánicos, exposición y foto</span>
                </div>
              </div>
              <button type="button" class="btn btn-sm" id="btn-assistant-toggle-label" style="pointer-events:none;">
                ${isEdit ? 'Explorar ▾' : 'Ocultar ▴'}
              </button>
            </div>

            <div id="plant-assistant-panel" class="plant-assistant-panel" style="${isEdit ? 'display:none;' : 'display:flex;'}">
              <!-- CATEGORY CHIPS -->
              <div class="plant-category-chips" id="plant-category-chips">
                <button type="button" class="plant-chip active" data-cat="all">⭐ Todos (100)</button>
                <button type="button" class="plant-chip" data-cat="aromatic">🌿 Aromáticas (20)</button>
                <button type="button" class="plant-chip" data-cat="vegetable">🍅 Huerto en Maceta (22)</button>
                <button type="button" class="plant-chip" data-cat="flowering">🌸 Florales (22)</button>
                <button type="button" class="plant-chip" data-cat="citrus">🍋 Frutales y Cítricos (8)</button>
                <button type="button" class="plant-chip" data-cat="foliage">🪴 Follaje y Sombra (16)</button>
                <button type="button" class="plant-chip" data-cat="succulent">🌵 Cactus y Crasas (12)</button>
              </div>

              <!-- SEARCH INPUT -->
              <div class="plant-search-wrap">
                <span class="plant-search-icon">🔍</span>
                <input type="text" id="input-plant-catalog-search" class="plant-search-input" placeholder="Buscar especie (ej: Albahaca, Tomate Raf, Romero, Buganvilla, Monstera...)" autocomplete="off" />
              </div>

              <!-- PLANT LIST (CARDS) -->
              <div class="plant-catalog-list" id="plant-catalog-list">
                <!-- Rendered via JS -->
              </div>

              <!-- BOTÓN BUSCAR ONLINE EN WIKIPEDIA / OPENFARM -->
              <div class="plant-online-btn-row">
                <span>¿No la encuentras en las 100 de España?</span>
                <button type="button" class="btn btn-sm btn-outline" id="btn-search-online-plants">
                  🌐 Buscar en Wikipedia & OpenFarm
                </button>
              </div>

              <!-- ONLINE RESULTS CONTAINER -->
              <div id="plant-online-results" style="display:none; flex-direction:column; gap:0.45rem;">
                <!-- Rendered via JS -->
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="input-pot-name">Nombre / Identificador de la Maceta:</label>
              <input type="text" id="input-pot-name" class="form-input" required placeholder="Ej: Geranio Balcón Este" value="${pot.name || ''}" />
            </div>

            <!-- FOTO DE LA MACETA -->
            <div class="form-group">
              <label class="form-label">📸 Foto de la Planta (opcional):</label>
              <div style="display:flex; align-items:center; gap:0.75rem;">
                <div class="file-input-wrapper">
                  <button class="btn btn-sm" type="button">
                    📷 Seleccionar o Tomar Foto
                  </button>
                  <input type="file" id="input-pot-photo" accept="image/*" capture="environment" />
                </div>

                <div id="pot-photo-preview-wrap" class="photo-preview-wrap" style="${existingCover ? 'display:block;' : ''}">
                  <img id="pot-photo-preview-img" src="${existingCover || ''}" alt="Previsualización" />
                </div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="select-plant-type">Tipo de Planta:</label>
              <select id="select-plant-type" class="form-select">
                ${Object.values(PLANT_TYPES).map(pt => `
                  <option value="${pt.id}" ${pt.id === pot.plantType ? 'selected' : ''}>
                    ${pt.icon} ${pt.label}
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="form-group">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <label class="form-label" for="select-container-parent">🪴 Ubicación / Jardinera Compartida (opcional):</label>
                <button type="button" class="btn btn-sm" id="btn-quick-manage-containers" style="font-size:0.7rem; padding:0.15rem 0.45rem;">
                  ⚙️ Gestionar Jardineras
                </button>
              </div>
              <select id="select-container-parent" class="form-select">
                <option value="">-- Maceta individual independiente --</option>
                ${(this.containers || db.getContainers()).map(c => `
                  <option value="${c.id}" ${c.id === pot.containerId ? 'selected' : ''}>
                    🪴 ${c.name} (${c.totalLiters}L, ${c.sections} secciones, ${c.material})
                  </option>
                `).join('')}
              </select>
              <span style="font-size:0.7rem; color:var(--text-muted);">
                Si seleccionas una jardinera, la planta heredará la inercia térmica de su volumen y su exposición solar.
              </span>
            </div>

            <div class="form-group">
              <label class="form-label" for="select-material">Material de la Maceta:</label>
              <select id="select-material" class="form-select">
                ${Object.values(POT_MATERIALS).map(m => `
                  <option value="${m.id}" ${m.id === pot.material ? 'selected' : ''}>
                    ${m.label}
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="select-size">Tamaño / Volumen de Sustrato individual:</label>
              <select id="select-size" class="form-select">
                ${Object.values(POT_SIZES).map(s => `
                  <option value="${s.id}" ${s.id === pot.size ? 'selected' : ''}>
                    ${s.label}
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="select-sun">Exposición Solar:</label>
              <select id="select-sun" class="form-select">
                ${Object.values(SUN_EXPOSURES).map(sun => `
                  <option value="${sun.id}" ${sun.id === pot.sunExposure ? 'selected' : ''}>
                    ${sun.label}
                  </option>
                `).join('')}
              </select>
            </div>

            <label class="form-checkbox-row">
              <input type="checkbox" id="check-covered" ${pot.isCovered ? 'checked' : ''} />
              <span><strong>Balcón Techado:</strong> La lluvia exterior no moja directamente esta maceta.</span>
            </label>

            <div class="form-group">
              <label class="form-label" for="input-notes">Notas adicionales (opcional):</label>
              <input type="text" id="input-notes" class="form-input" placeholder="Ej: trasplantada en marzo, drenaje con perlita" value="${pot.notes || ''}" />
            </div>

            <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.5rem;">
              <button type="button" class="btn" id="btn-cancel-pot">Cancelar</button>
              <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar Cambios' : 'Crear Maceta'}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.getElementById('btn-close-pot-modal')?.addEventListener('click', () => { container.innerHTML = ''; });
    document.getElementById('btn-cancel-pot')?.addEventListener('click', () => { container.innerHTML = ''; });
    document.getElementById('btn-quick-manage-containers')?.addEventListener('click', () => {
      this.openContainersModal();
    });

    let compressedPhotoData = null;
    const photoInput = document.getElementById('input-pot-photo');
    photoInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          const res = await photoDb.compressImage(file);
          compressedPhotoData = res.dataUrl;

          const previewWrap = document.getElementById('pot-photo-preview-wrap');
          const previewImg = document.getElementById('pot-photo-preview-img');
          if (previewWrap && previewImg) {
            previewImg.src = res.dataUrl;
            previewWrap.style.display = 'block';
          }
        } catch (err) {
          console.warn('Error comprimiendo foto:', err);
        }
      }
    });

    // Configurar Asistente Botánico
    this.setupBotanicalAssistant(container, (plant) => {
      const nameInput = document.getElementById('input-pot-name');
      const plantTypeSelect = document.getElementById('select-plant-type');
      const materialSelect = document.getElementById('select-material');
      const sizeSelect = document.getElementById('select-size');
      const sunSelect = document.getElementById('select-sun');
      const notesInput = document.getElementById('input-notes');

      if (nameInput) {
        nameInput.value = plant.name;
        nameInput.classList.remove('field-highlighted');
        void nameInput.offsetWidth;
        nameInput.classList.add('field-highlighted');
      }

      if (plantTypeSelect && plant.plantType) {
        plantTypeSelect.value = plant.plantType;
        plantTypeSelect.classList.remove('field-highlighted');
        void plantTypeSelect.offsetWidth;
        plantTypeSelect.classList.add('field-highlighted');
      }

      if (materialSelect && plant.defaultMaterial) {
        materialSelect.value = plant.defaultMaterial;
        materialSelect.classList.remove('field-highlighted');
        void materialSelect.offsetWidth;
        materialSelect.classList.add('field-highlighted');
      }

      if (sizeSelect && plant.defaultSize) {
        sizeSelect.value = plant.defaultSize;
        sizeSelect.classList.remove('field-highlighted');
        void sizeSelect.offsetWidth;
        sizeSelect.classList.add('field-highlighted');
      }

      if (sunSelect && plant.defaultSun) {
        sunSelect.value = plant.defaultSun;
        sunSelect.classList.remove('field-highlighted');
        void sunSelect.offsetWidth;
        sunSelect.classList.add('field-highlighted');
      }

      if (notesInput && (plant.description || plant.scientificName)) {
        const noteText = `${plant.scientificName ? `[${plant.scientificName}] ` : ''}${plant.description || ''}`;
        notesInput.value = noteText;
        notesInput.classList.remove('field-highlighted');
        void notesInput.offsetWidth;
        notesInput.classList.add('field-highlighted');
      }

      // Foto sugerida si viene de Wikipedia / API externa
      if (plant.thumbnail && !compressedPhotoData) {
        compressedPhotoData = plant.thumbnail;
        const previewWrap = document.getElementById('pot-photo-preview-wrap');
        const previewImg = document.getElementById('pot-photo-preview-img');
        if (previewWrap && previewImg) {
          previewImg.src = plant.thumbnail;
          previewWrap.style.display = 'block';
        }
      }

      // Colapsar asistente
      const panel = document.getElementById('plant-assistant-panel');
      const toggleLabel = document.getElementById('btn-assistant-toggle-label');
      if (panel) panel.style.display = 'none';
      if (toggleLabel) toggleLabel.innerText = 'Explorar ▾';

      audioService.playChime();
      this.showToast(`✨ ¡Datos aplicados de ${plant.name}!`, 'success');
    });

    document.getElementById('pot-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('input-pot-name').value.trim();
      const containerId = document.getElementById('select-container-parent')?.value || null;
      const plantType = document.getElementById('select-plant-type').value;
      const material = document.getElementById('select-material').value;
      const size = document.getElementById('select-size').value;
      const sunExposure = document.getElementById('select-sun').value;
      const isCovered = document.getElementById('check-covered').checked;
      const notes = document.getElementById('input-notes').value.trim();

      let targetPotId = editId;

      if (isEdit) {
        db.updatePot(editId, { name, containerId, plantType, material, size, sunExposure, isCovered, notes });
        this.showToast('Maceta actualizada', 'success');
      } else {
        const newPot = db.addPot({ name, containerId, plantType, material, size, sunExposure, isCovered, notes });
        targetPotId = newPot.id;
        this.showToast('Nueva maceta añadida', 'success');
      }

      if (compressedPhotoData && targetPotId) {
        await photoDb.addPhoto({
          potId: targetPotId,
          dataUrl: compressedPhotoData,
          note: isEdit ? 'Foto actualizada' : 'Foto inicial de la planta',
          isCover: true,
          isInitial: !isEdit
        });
      }

      container.innerHTML = '';
      await this.refreshData();
      this.render();
    });
  }

  setupBotanicalAssistant(container, onSelect) {
    const banner = container.querySelector('#btn-toggle-plant-assistant');
    const panel = container.querySelector('#plant-assistant-panel');
    const toggleLabel = container.querySelector('#btn-assistant-toggle-label');
    const searchInput = container.querySelector('#input-plant-catalog-search');
    const chips = container.querySelectorAll('.plant-chip');
    const listEl = container.querySelector('#plant-catalog-list');
    const onlineBtn = container.querySelector('#btn-search-online-plants');
    const onlineResultsEl = container.querySelector('#plant-online-results');

    if (!panel || !listEl) return;

    let currentCategory = 'all';
    let searchQuery = '';
    let debounceTimer = null;

    // Toggle panel
    banner?.addEventListener('click', () => {
      const isHidden = panel.style.display === 'none';
      panel.style.display = isHidden ? 'flex' : 'none';
      if (toggleLabel) toggleLabel.innerText = isHidden ? 'Ocultar ▴' : 'Explorar ▾';
      if (isHidden && searchInput) searchInput.focus();
    });

    const renderCatalog = () => {
      const results = plantApiService.searchCatalog(searchQuery, currentCategory);
      if (results.length === 0) {
        listEl.innerHTML = `
          <div style="padding:1rem; text-align:center; color:#94a3b8; font-size:0.8rem;">
            No hay especies coincidentes en el catálogo local.<br>
            <span style="font-size:0.75rem;">Usa el botón de abajo para buscar en Wikipedia y OpenFarm.</span>
          </div>
        `;
        return;
      }

      listEl.innerHTML = results.map(p => `
        <div class="plant-catalog-card" data-id="${p.id}">
          <div style="font-size:1.6rem; line-height:1; flex-shrink:0;">${p.icon}</div>
          <div class="plant-card-info">
            <div class="plant-card-title-row">
              <span class="plant-card-title">${p.name}</span>
            </div>
            <div class="plant-card-scientific">${p.scientificName}</div>
            <div class="plant-badges-row">
              <span class="plant-badge water-${p.waterNeed}">💧 ${p.waterNeed === 'alta' ? 'Mucha agua' : p.waterNeed === 'media' ? 'Agua media' : 'Poco riego'}</span>
              <span class="plant-badge frost-${p.frostResistance}">${p.frostResistance === 'resistente' ? '❄️ Resiste heladas' : p.frostResistance === 'media' ? '❄️ Helada ligera' : '❄️ Sensible a frío'}</span>
              <span class="plant-badge">☀️ ${p.defaultSun === 'full_sun' ? 'Sol directo' : p.defaultSun === 'partial_shade' ? 'Semisombra' : 'Sombra'}</span>
            </div>
          </div>
          <button type="button" class="btn btn-sm btn-primary" style="padding:0.3rem 0.6rem; font-size:0.75rem; white-space:nowrap;">
            Elegir
          </button>
        </div>
      `).join('');

      listEl.querySelectorAll('.plant-catalog-card').forEach(card => {
        card.addEventListener('click', () => {
          const plant = plantApiService.getCatalogPlantById(card.dataset.id);
          if (plant) onSelect(plant);
        });
      });
    };

    // Category chips
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentCategory = chip.dataset.cat;
        renderCatalog();
      });
    });

    // Search input
    searchInput?.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderCatalog();

      clearTimeout(debounceTimer);
      if (searchQuery.length >= 3) {
        debounceTimer = setTimeout(() => {
          searchOnline(searchQuery);
        }, 550);
      } else {
        if (onlineResultsEl) onlineResultsEl.style.display = 'none';
      }
    });

    const searchOnline = async (query) => {
      if (!onlineResultsEl || !query || query.length < 2) return;
      onlineResultsEl.style.display = 'flex';
      onlineResultsEl.innerHTML = `
        <div style="font-size:0.78rem; color:#93c5fd; padding:0.4rem; display:flex; align-items:center; gap:0.4rem;">
          <span class="loader-spinner" style="width:14px; height:14px; border-width:2px;"></span>
          Consultando Wikipedia REST API y OpenFarm / GrowStuff en vivo...
        </div>
      `;

      try {
        const [wiki, openFarm] = await Promise.all([
          plantApiService.searchWikipedia(query),
          plantApiService.searchOpenFarm(query)
        ]);

        const combined = [...wiki, ...openFarm];

        if (combined.length === 0) {
          onlineResultsEl.innerHTML = `
            <div style="font-size:0.75rem; color:#94a3b8; padding:0.3rem 0.5rem;">
              No se encontraron resultados externos adicionales en Wikipedia ni OpenFarm para "${query}".
            </div>
          `;
          return;
        }

        onlineResultsEl.innerHTML = `
          <div style="font-size:0.75rem; font-weight:700; color:#93c5fd; display:flex; align-items:center; justify-content:space-between; margin-top:0.3rem;">
            <span>🌐 Resultados Externos (${combined.length})</span>
            <span style="font-size:0.68rem; font-weight:normal; color:#cbd5e1;">Haz clic para importar</span>
          </div>
          ${combined.map((item, idx) => `
            <div class="plant-online-item" data-idx="${idx}">
              ${item.thumbnail ? `<img src="${item.thumbnail}" class="plant-online-thumb" alt="${item.title}" />` : `<div style="font-size:1.6rem; padding:0.2rem;">🌐</div>`}
              <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:0.4rem;">
                  <strong style="color:#ffffff; font-size:0.82rem;">${item.title}</strong>
                  <span class="plant-source-badge">${item.sourceBadge}</span>
                </div>
                <div style="font-size:0.7rem; color:#94a3b8; font-style:italic; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  ${item.scientificName}
                </div>
                <div style="font-size:0.7rem; color:#cbd5e1; margin-top:0.15rem; line-height:1.3; max-height:2.6em; overflow:hidden; text-overflow:ellipsis;">
                  ${item.extract}
                </div>
              </div>
              <button type="button" class="btn btn-sm btn-outline" style="font-size:0.72rem; white-space:nowrap;">
                Importar
              </button>
            </div>
          `).join('')}
        `;

        onlineResultsEl.querySelectorAll('.plant-online-item').forEach(el => {
          el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.idx, 10);
            const item = combined[idx];
            if (item) {
              onSelect({
                name: item.title,
                scientificName: item.scientificName,
                plantType: item.inferredAgronomics.plantType,
                defaultMaterial: item.inferredAgronomics.defaultMaterial,
                defaultSize: item.inferredAgronomics.defaultSize,
                defaultSun: item.inferredAgronomics.defaultSun,
                description: item.extract,
                thumbnail: item.thumbnail
              });
            }
          });
        });
      } catch (err) {
        onlineResultsEl.innerHTML = `
          <div style="font-size:0.75rem; color:#f87171; padding:0.3rem 0.5rem;">
            Error consultando APIs externas: ${err.message}
          </div>
        `;
      }
    };

    onlineBtn?.addEventListener('click', () => {
      const q = searchInput?.value.trim() || 'planta';
      searchOnline(q);
    });

    // Initial render
    renderCatalog();
  }

  openCityModal() {
    const container = document.getElementById('modal-container');
    if (!container) return;

    const currentLoc = weatherService.getLocation();

    container.innerHTML = `
      <div class="modal-overlay active" id="city-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">📍 Cambiar Localidad</h3>
            <button class="modal-close" id="btn-close-city-modal">&times;</button>
          </div>

          <div style="display:flex; flex-direction:column; gap:1rem;">
            <p style="font-size:0.82rem; color:var(--text-muted);">
              Ubicación actual: <strong>${currentLoc.name}</strong> (${currentLoc.latitude.toFixed(2)}, ${currentLoc.longitude.toFixed(2)})
            </p>

            <button class="btn btn-water" id="btn-gps-locate" style="justify-content:center;">
              🧭 Usar mi ubicación GPS actual
            </button>

            <div style="position:relative; margin-top:0.5rem;">
              <label class="form-label" for="city-search-input">O busca una ciudad / pueblo:</label>
              <div style="display:flex; gap:0.5rem;">
                <input type="text" id="city-search-input" class="form-input" placeholder="Ej: Valencia, Sevilla, Granada..." style="flex:1;" />
                <button class="btn btn-primary" id="btn-search-city">Buscar</button>
              </div>
            </div>

            <div id="city-results" style="display:flex; flex-direction:column; gap:0.4rem; max-height:180px; overflow-y:auto;"></div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-close-city-modal')?.addEventListener('click', () => { container.innerHTML = ''; });

    document.getElementById('btn-gps-locate')?.addEventListener('click', () => {
      if (!navigator.geolocation) {
        alert('La geolocalización GPS no está soportada por tu navegador.');
        return;
      }
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        weatherService.saveLocation({
          name: 'Mi Ubicación GPS',
          latitude: lat,
          longitude: lon,
          country: 'Local'
        });
        container.innerHTML = '';
        await this.refreshData(true);
        this.render();
        this.showToast('Ubicación GPS establecida', 'success');
      }, (err) => {
        alert('No se pudo obtener la posición GPS: ' + err.message);
      });
    });

    const doSearch = async () => {
      const q = document.getElementById('city-search-input')?.value;
      const resultsDiv = document.getElementById('city-results');
      if (!resultsDiv || !q) return;

      resultsDiv.innerHTML = '<span style="font-size:0.75rem; color:var(--text-muted);">Buscando...</span>';
      const results = await weatherService.searchCities(q);

      if (results.length === 0) {
        resultsDiv.innerHTML = '<span style="font-size:0.75rem; color:var(--text-muted);">No se encontraron resultados.</span>';
        return;
      }

      resultsDiv.innerHTML = results.map((r, i) => `
        <button class="btn btn-sm city-result-item" data-index="${i}" style="justify-content:flex-start; text-align:left;">
          📍 ${r.name} (${r.country || ''})
        </button>
      `).join('');

      resultsDiv.querySelectorAll('.city-result-item').forEach(b => {
        b.addEventListener('click', async () => {
          const item = results[parseInt(b.dataset.index, 10)];
          weatherService.saveLocation(item);
          container.innerHTML = '';
          await this.refreshData(true);
          this.render();
          this.showToast(`Localidad cambiada a ${item.name}`, 'success');
        });
      });
    };

    document.getElementById('btn-search-city')?.addEventListener('click', doSearch);
    document.getElementById('city-search-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });
  }

  openApkModal() {
    const container = document.getElementById('modal-container');
    if (!container) return;

    container.innerHTML = `
      <div class="modal-overlay active" id="apk-modal">
        <div class="modal-content" style="max-width:540px;">
          <div class="modal-header">
            <h3 class="modal-title">📱 PWA & Conversión a APK Nativo</h3>
            <button class="modal-close" id="btn-close-apk-modal">&times;</button>
          </div>

          <div style="display:flex; flex-direction:column; gap:1rem; font-size:0.85rem; line-height:1.5;">
            <div style="background:rgba(16, 185, 129, 0.1); border:1px solid #10b981; border-radius:var(--radius-sm); padding:0.75rem;">
              <strong>1. Instalar como PWA en tu móvil (Inmediato):</strong>
              <p style="margin-top:0.3rem;">
                En Chrome (Android) o Safari (iOS), pulsa en los 3 puntos o botón compartir y elige <strong>"Añadir a pantalla de inicio"</strong>. La app funcionará a pantalla completa y sin barras de navegador.
              </p>
            </div>

            <div style="background:rgba(2, 132, 199, 0.1); border:1px solid #38bdf8; border-radius:var(--radius-sm); padding:0.75rem;">
              <strong>2. ¿Convertir a APK Nativo con Alarmas de Sistema (Capacitor)?</strong>
              <p style="margin-top:0.3rem;">
                Para que suenen alarmas nativas usando el <code>AlarmManager</code> de Android (sin internet y sin servidores), hemos configurado el proyecto listo para Capacitor:
              </p>
              <pre style="background:#050911; padding:0.6rem; border-radius:6px; font-size:0.75rem; margin-top:0.4rem; overflow-x:auto;">
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "HidroBalcon" "app.hidrobalcon.riego"
npm run build
npx cap add android
npx cap open android
              </pre>
            </div>

            <p style="color:var(--text-muted); font-size:0.8rem;">
              También puedes usar el botón <strong>"⏰ Alarma"</strong> o la sección <strong>"📅 Agenda de Alarmas"</strong> para exportar recordatorios agrupados directamente a la aplicación de calendario de tu teléfono.
            </p>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-close-apk-modal')?.addEventListener('click', () => { container.innerHTML = ''; });
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(15px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }
}

// Inicializar la aplicación al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  window.hidroApp = new HidroBalconApp();
});
