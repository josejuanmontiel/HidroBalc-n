import { Chart, registerables } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { generatePotAnalyticsTimeline } from '../services/analyticsService.js';
import { db } from '../storage/db.js';

// Registrar Chart.js y plugin de zoom
Chart.register(...registerables, zoomPlugin);

let currentChartInstance = null;

export const chartAnalyticsView = {
  renderAnalyticsView(selectedPotId, pots, weatherData, customSettings = {}) {
    const logs = db.getLogs();
    const pot = pots.find(p => p.id === selectedPotId) || pots[0] || null;

    if (!pot) {
      return `
        <section class="analytics-view-container">
          <div class="analytics-header-card">
            <h2>📊 Analítica & Telemetría Agronómica</h2>
            <p>No hay macetas registradas para analizar.</p>
          </div>
        </section>
      `;
    }

    const timeline = generatePotAnalyticsTimeline(pot, weatherData, customSettings, logs);
    const summary = timeline.summary || {};

    return `
      <section class="analytics-view-container">
        <!-- CABECERA Y SELECTOR DE MACETA -->
        <div class="analytics-header-card">
          <div class="analytics-header-top">
            <div>
              <div class="analytics-badge-title">
                <span class="badge-tag">🔬 PREVISIÓN VS REAL</span>
                <h2>📊 Analítica de Riego & Secado</h2>
              </div>
              <p class="analytics-subtitle">
                Evolución de humedad, temperaturas, lluvias registradas y reajustes del modelo adaptativo para cada maceta.
              </p>
            </div>

            <div class="analytics-controls-row">
              <label for="analytics-pot-select" class="form-label" style="margin:0; font-weight:700;">Maceta analizada:</label>
              <select id="analytics-pot-select" class="analytics-pot-dropdown">
                ${pots.map(p => `
                  <option value="${p.id}" ${p.id === pot.id ? 'selected' : ''}>
                    ${p.name} (${p.plantType || 'Planta'}) ${p.container ? `[🪴 ${p.container.name}]` : ''}
                  </option>
                `).join('')}
              </select>
              <button id="btn-analytics-back" class="btn btn-sm" title="Volver a la vista del balcón">
                🪴 Volver al Balcón
              </button>
            </div>
          </div>

          <!-- RESUMEN DE INDICADORES DE LA MACETA -->
          <div class="analytics-kpi-grid">
            <div class="kpi-card">
              <div class="kpi-icon">💧</div>
              <div class="kpi-content">
                <div class="kpi-label">Humedad Sustrato Actual</div>
                <div class="kpi-value ${pot.calc?.soilMoisturePercent <= 30 ? 'kpi-alert' : 'kpi-good'}">
                  ${pot.calc?.soilMoisturePercent ?? 100}%
                </div>
                <div class="kpi-sub">Umbral de riego: ${timeline.threshold}%</div>
              </div>
            </div>

            <div class="kpi-card">
              <div class="kpi-icon">🧠</div>
              <div class="kpi-content">
                <div class="kpi-label">Factor Adaptativo Calibrado</div>
                <div class="kpi-value">
                  ${timeline.learnedFactor}x
                </div>
                <div class="kpi-sub">${pot.calibrationCount ? `${pot.calibrationCount} calibración(es) activa(s)` : 'Factor nominal estándar'}</div>
              </div>
            </div>

            <div class="kpi-card">
              <div class="kpi-icon">📅</div>
              <div class="kpi-content">
                <div class="kpi-label">Próximo Riego Esperado</div>
                <div class="kpi-value" style="font-size: 1.1rem; color: #38bdf8;">
                  ${timeline.nextWateringExpected ? timeline.nextWateringExpected : 'Hoy / Inminente'}
                </div>
                <div class="kpi-sub">
                  ${pot.calc?.daysUntilWatering ? `En ~${Math.ceil(pot.calc.daysUntilWatering)} días` : 'Listo para regar'}
                </div>
              </div>
            </div>

            <div class="kpi-card">
              <div class="kpi-icon">🛡️</div>
              <div class="kpi-content">
                <div class="kpi-label">Ubicación & Heladas</div>
                <div class="kpi-value" style="font-size: 1.05rem;">
                  ${timeline.isCovered ? '🏠 Bajo Techo' : '🌧️ Cielo Abierto'}
                </div>
                <div class="kpi-sub">
                  ${summary.frostDaysCount > 0 ? `⚠️ ${summary.frostDaysCount} día(s) con riesgo helada` : 'Sin heladas inminentes'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- CONTENEDOR DE LA GRÁFICA INTERACTIVA -->
        <div class="analytics-chart-card">
          <div class="chart-toolbar">
            <div class="chart-toolbar-title">
              <strong>Curva Multieje Temporal</strong>
              <span class="chart-hint">💡 Usa la rueda del ratón o pellizca en móvil para hacer <strong>Zoom</strong> y arrastra para desplazarte</span>
            </div>
            <div class="chart-toolbar-actions">
              <button id="btn-chart-reset-zoom" class="btn btn-sm" title="Restablecer vista inicial">
                🔍 Reset Zoom
              </button>
            </div>
          </div>

          <div class="chart-canvas-wrapper" style="position: relative; height: 380px; width: 100%;">
            <canvas id="pot-analytics-chart"></canvas>
          </div>

          <div class="chart-legend-custom">
            <div class="legend-item"><span class="legend-dot" style="background:#10b981;"></span> Humedad Sustrato (%)</div>
            <div class="legend-item"><span class="legend-dot" style="background:#ef4444; border-top: 2px dashed #ef4444;"></span> Umbral de Riego (${timeline.threshold}%)</div>
            <div class="legend-item"><span class="legend-dot" style="background:#f59e0b;"></span> Temp. Máxima (°C)</div>
            <div class="legend-item"><span class="legend-dot" style="background:#38bdf8;"></span> Temp. Mínima (°C)</div>
            <div class="legend-item"><span class="legend-dot" style="background:rgba(14, 165, 233, 0.5);"></span> Lluvia Acumulada (mm)</div>
            <div class="legend-item"><span class="legend-dot" style="background:#a855f7;"></span> 💧 Riegos & Reajustes</div>
          </div>
        </div>

        <!-- LISTADO DE EVENTOS Y REAJUSTES DEL MODELO -->
        <div class="analytics-events-card">
          <div class="events-card-header">
            <h3>📑 Registro de Riegos y Reajustes del Algoritmo (${timeline.reajustes.length + summary.realWateringsCount})</h3>
          </div>
          
          ${(timeline.reajustes.length === 0 && summary.realWateringsCount === 0) ? `
            <div class="events-empty">
              No hay reajustes atípicos ni calibraciones registradas en este intervalo. El secado sigue el modelo agronómico nominal.
            </div>
          ` : `
            <div class="events-timeline-list">
              ${timeline.reajustes.map(r => `
                <div class="event-item event-reajuste">
                  <div class="event-date">📅 ${r.date}</div>
                  <div class="event-body">
                    <div class="event-badge badge-reajuste">⚙️ REAJUSTE DE MODELO</div>
                    <div class="event-desc">${r.desc}</div>
                    ${r.note ? `<div class="event-note">Nota: ${r.note}</div>` : ''}
                  </div>
                </div>
              `).join('')}

              ${timeline.days.filter(d => d.wateringEvent && d.wateringEvent.type === 'real').map(d => `
                <div class="event-item event-watering">
                  <div class="event-date">📅 ${d.date}</div>
                  <div class="event-body">
                    <div class="event-badge badge-water">💧 RIEGO EFECTUADO</div>
                    <div class="event-desc">
                      Aporte de agua registrado. Humedad reiniciada al 100% de capacidad de campo.
                    </div>
                    ${d.wateringEvent.note ? `<div class="event-note">${d.wateringEvent.note}</div>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </section>
    `;
  },

  initChart(timeline) {
    const ctx = document.getElementById('pot-analytics-chart');
    if (!ctx) return;

    if (currentChartInstance) {
      currentChartInstance.destroy();
      currentChartInstance = null;
    }

    const labels = timeline.days.map(d => {
      const parts = d.date.split('-');
      return `${parts[2]}/${parts[1]}`;
    });

    const moistureData = timeline.days.map(d => d.moisturePercent);
    const thresholdData = timeline.days.map(() => timeline.threshold);
    const maxTempData = timeline.days.map(d => d.maxTemp);
    const minTempData = timeline.days.map(d => d.minTemp);
    const rainData = timeline.days.map(d => d.rainSum);

    // Puntos especiales para riegos reales y reajustes
    const wateringPoints = timeline.days.map(d => {
      if (d.wateringEvent && d.wateringEvent.type === 'real') {
        return d.moisturePercent;
      }
      return null;
    });

    const projectedPoints = timeline.days.map(d => {
      if (d.wateringEvent && d.wateringEvent.type === 'projected') {
        return d.moisturePercent;
      }
      return null;
    });

    currentChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          // 1. Curva de Humedad del Sustrato
          {
            label: 'Humedad Sustrato (%)',
            data: moistureData,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            fill: true,
            tension: 0.35,
            yAxisID: 'yMoisture',
            pointRadius: 4,
            pointHoverRadius: 7,
            pointBackgroundColor: '#10b981',
            borderWidth: 2.5
          },
          // 2. Umbral de Riego
          {
            label: `Umbral de Riego (${timeline.threshold}%)`,
            data: thresholdData,
            borderColor: '#ef4444',
            borderDash: [5, 5],
            fill: false,
            pointRadius: 0,
            yAxisID: 'yMoisture',
            borderWidth: 1.8
          },
          // 3. Riego Real Registrado (Puntos)
          {
            label: 'Riego Real Efectuado',
            data: wateringPoints,
            showLine: false,
            pointRadius: 8,
            pointHoverRadius: 10,
            pointBackgroundColor: '#3b82f6',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointStyle: 'circle',
            yAxisID: 'yMoisture'
          },
          // 4. Riego Proyectado (Puntos)
          {
            label: 'Riego Previsto (Algoritmo)',
            data: projectedPoints,
            showLine: false,
            pointRadius: 8,
            pointHoverRadius: 10,
            pointBackgroundColor: '#f59e0b',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointStyle: 'rectRot',
            yAxisID: 'yMoisture'
          },
          // 5. Temperatura Máxima
          {
            label: 'Temp. Máx (°C)',
            data: maxTempData,
            borderColor: '#f59e0b',
            fill: false,
            tension: 0.3,
            yAxisID: 'yTemp',
            pointRadius: 3,
            borderWidth: 1.8
          },
          // 6. Temperatura Mínima
          {
            label: 'Temp. Mín (°C)',
            data: minTempData,
            borderColor: '#38bdf8',
            fill: false,
            tension: 0.3,
            yAxisID: 'yTemp',
            pointRadius: 3,
            borderWidth: 1.8
          },
          // 7. Lluvia Diaria (Barras)
          {
            type: 'bar',
            label: 'Lluvia Diaria (mm)',
            data: rainData,
            backgroundColor: 'rgba(14, 165, 233, 0.45)',
            borderColor: '#0284c7',
            borderWidth: 1,
            yAxisID: 'yRain',
            barPercentage: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: false // Usamos la leyenda HTML propia estilizada
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#f8fafc',
            bodyColor: '#cbd5e1',
            borderColor: 'rgba(148, 163, 184, 0.25)',
            borderWidth: 1,
            padding: 12,
            boxPadding: 6,
            callbacks: {
              title: function(items) {
                if (!items.length) return '';
                const idx = items[0].dataIndex;
                const d = timeline.days[idx];
                const tag = d.isToday ? ' [HOY]' : (d.isPast ? ' [Histórico]' : ' [Previsión]');
                return `📅 ${d.date}${tag}`;
              },
              afterBody: function(items) {
                if (!items.length) return [];
                const idx = items[0].dataIndex;
                const d = timeline.days[idx];
                const extra = [];

                if (d.isFrostDay) {
                  extra.push(`❄️ Riesgo de Helada: Mínima ${d.minTemp}°C`);
                }
                if (d.wateringEvent) {
                  if (d.wateringEvent.type === 'real') {
                    extra.push(`💧 RIEGO EFECTUADO: ${d.wateringEvent.note || 'Registrado'}`);
                  } else {
                    extra.push(`✨ RIEGO PREVISTO: ~${d.wateringEvent.doseMl} ml recomendados`);
                  }
                }
                if (d.reajusteEvent) {
                  extra.push(`⚙️ REAJUSTE: ${d.reajusteEvent.desc}`);
                }
                if (timeline.isCovered && d.rainSum > 0) {
                  extra.push(`🏠 Bajo Techo: ${d.rainSum} mm de lluvia no penetraron`);
                } else if (!timeline.isCovered && d.rainAbsorbed > 0) {
                  extra.push(`🌧️ Lluvia absorbida por el sustrato: +${d.rainAbsorbed} mm`);
                }

                return extra;
              }
            }
          },
          zoom: {
            pan: {
              enabled: true,
              mode: 'x'
            },
            zoom: {
              wheel: {
                enabled: true
              },
              pinch: {
                enabled: true
              },
              mode: 'x'
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(255, 255, 255, 0.06)'
            },
            ticks: {
              color: '#94a3b8'
            }
          },
          yMoisture: {
            type: 'linear',
            position: 'left',
            min: 0,
            max: 105,
            title: {
              display: true,
              text: 'Humedad Sustrato (%)',
              color: '#10b981',
              font: { weight: 'bold' }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.05)'
            },
            ticks: {
              color: '#10b981'
            }
          },
          yTemp: {
            type: 'linear',
            position: 'right',
            title: {
              display: true,
              text: 'Temperatura (°C)',
              color: '#f59e0b',
              font: { weight: 'bold' }
            },
            grid: {
              drawOnChartArea: false
            },
            ticks: {
              color: '#f59e0b'
            }
          },
          yRain: {
            type: 'linear',
            position: 'right',
            min: 0,
            max: 40,
            display: false,
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    });

    document.getElementById('btn-chart-reset-zoom')?.addEventListener('click', () => {
      if (currentChartInstance) {
        currentChartInstance.resetZoom();
      }
    });
  }
};
