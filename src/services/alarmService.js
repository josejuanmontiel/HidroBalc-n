/**
 * Servicio de Alarmas y Sincronización con Calendario Nativo (Android / iOS)
 * Genera archivos estándar .ics (iCalendar) con componentes VALARM (despertador/alarma).
 * Permite consolidar múltiples macetas que coincidan en el mismo día en una sola alarma,
 * e incluye enlace directo a la vista de "Tareas de Riego" para ir marcándolas.
 */

export class AlarmService {
  /**
   * Agrupa macetas calculadas por fecha de riego (mismo día calendario YYYY-MM-DD)
   * @param {Array} calculatedPots - Macetas con su cálculo agronómico
   * @param {string} baseUrl - URL base de la app (ej: https://... o http://localhost:5173/)
   */
  groupPotsByWateringDay(calculatedPots, baseUrl = '') {
    const groups = {};

    calculatedPots.forEach(p => {
      const calc = p.calc;
      // Si la maceta está en suspensión por helada, no se agenda hasta que pase el frío
      if (calc.status === 'frozen_hold') {
        return;
      }

      const nextDate = new Date(calc.nextWaterDate);
      const year = nextDate.getFullYear();
      const month = String(nextDate.getMonth() + 1).padStart(2, '0');
      const day = String(nextDate.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;

      if (!groups[dateKey]) {
        groups[dateKey] = {
          dateKey,
          dateObj: new Date(year, nextDate.getMonth(), nextDate.getDate(), 8, 30, 0), // Por defecto 08:30 AM
          pots: [],
          bestTimeOfDay: calc.bestTimeOfDay
        };
      }

      groups[dateKey].pots.push(p);
    });

    // Convertir a array ordenado por fecha
    return Object.values(groups)
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())
      .map(group => {
        const count = group.pots.length;
        const potNames = group.pots.map(p => p.name).join(', ');
        const shortSummary = count === 1
          ? `🪴 Riego: ${group.pots[0].name}`
          : `🪴 Riego Terraza (${count} macetas): ${group.pots.map(p => p.name).slice(0, 3).join(', ')}${count > 3 ? '...' : ''}`;

        const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '');
        const taskUrl = `${base}?view=tasks&date=${group.dateKey}`;

        return {
          ...group,
          count,
          potNames,
          title: shortSummary,
          taskUrl
        };
      });
  }

  /**
   * Genera el formato de fecha requerido por iCalendar (UTC)
   */
  formatICSDate(date) {
    const d = new Date(date);
    const pad = (n) => String(n).padStart(2, '0');
    return (
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      'T' +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) +
      'Z'
    );
  }

  /**
   * Genera un bloque VEVENT para una fecha consolidada
   */
  createVEventBlock({
    title,
    description,
    startDate,
    taskUrl = '',
    durationMinutes = 20,
    alarmMinutesBefore = 0
  }) {
    const startStr = this.formatICSDate(startDate);
    const endDate = new Date(new Date(startDate).getTime() + durationMinutes * 60000);
    const endStr = this.formatICSDate(endDate);
    const nowStr = this.formatICSDate(new Date());
    const uid = `riego-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@hidrobalcon.app`;

    const safeDesc = description.replace(/\r\n|\r|\n/g, '\\n');
    const safeTitle = title.replace(/\r\n|\r|\n/g, ' ');

    const lines = [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${nowStr}`,
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      `SUMMARY:${safeTitle}`,
      `DESCRIPTION:${safeDesc}`,
      taskUrl ? `URL:${taskUrl}` : '',
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      `TRIGGER:-PT${alarmMinutesBefore}M`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${safeTitle}`,
      'END:VALARM',
      'END:VEVENT'
    ].filter(Boolean);

    return lines.join('\r\n');
  }

  /**
   * Genera el contenido de un archivo .ics con uno o varios eventos
   */
  generateICalendar(events = []) {
    const list = Array.isArray(events) ? events : [events];
    const eventBlocks = list.map(e => this.createVEventBlock(e)).join('\r\n');

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//HidroBalcon PWA//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      eventBlocks,
      'END:VCALENDAR'
    ].join('\r\n');
  }

  /**
   * Descarga o abre el archivo .ics en el sistema operativo
   */
  downloadICS(icsContent, filename = `riego-consolidado-${new Date().toISOString().split('T')[0]}.ics`) {
    if (typeof document === 'undefined') return;
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /**
   * Genera y descarga la alarma conjunta para un día específico agrupado
   * @param {Object} dayGroup - Objeto de día agrupado retornado por groupPotsByWateringDay
   */
  exportConsolidatedDay(dayGroup) {
    const potListLines = dayGroup.pots.map(p => {
      const calc = p.calc;
      return `• ${calc.plantType.icon} ${p.name} (Humedad: ${calc.soilMoisturePercent}% - ${calc.actionTitle})`;
    }).join('\n');

    const description = [
      `📋 Tareas de riego en terraza para hoy (${dayGroup.count} macetas):`,
      potListLines,
      '',
      `🕒 Horario óptimo: ${dayGroup.bestTimeOfDay}`,
      '',
      `👉 Abre la lista de tareas para marcarlas como regadas:`,
      dayGroup.taskUrl,
      '',
      'Generado automáticamente por HidroBalcón PWA'
    ].join('\n');

    const ics = this.generateICalendar([
      {
        title: dayGroup.title,
        description,
        startDate: dayGroup.dateObj,
        taskUrl: dayGroup.taskUrl,
        durationMinutes: Math.max(15, dayGroup.count * 5),
        alarmMinutesBefore: 0
      }
    ]);

    this.downloadICS(ics, `riego-${dayGroup.dateKey}.ics`);
    return ics;
  }

  /**
   * Exporta toda la semana consolidada en un único archivo .ics (un evento por día que tenga riegos)
   */
  exportFullSchedule(dayGroups) {
    const events = dayGroups.map(dayGroup => {
      const potListLines = dayGroup.pots.map(p => {
        const calc = p.calc;
        return `• ${calc.plantType.icon} ${p.name} (Humedad: ${calc.soilMoisturePercent}%)`;
      }).join('\n');

      const description = [
        `📋 Riego de ${dayGroup.count} maceta(s):`,
        potListLines,
        '',
        `🕒 Horario: ${dayGroup.bestTimeOfDay}`,
        '',
        `👉 Abrir lista de tareas: ${dayGroup.taskUrl}`
      ].join('\n');

      return {
        title: dayGroup.title,
        description,
        startDate: dayGroup.dateObj,
        taskUrl: dayGroup.taskUrl,
        durationMinutes: Math.max(15, dayGroup.count * 5),
        alarmMinutesBefore: 0
      };
    });

    const ics = this.generateICalendar(events);
    this.downloadICS(ics, `calendario-riego-semanal.ics`);
    return ics;
  }

  /**
   * Compatibilidad hacia atrás: Programa alarma para una sola maceta individual
   */
  scheduleWateringAlarm(potAnalysis, targetHour = 8, targetMinute = 30) {
    const nextDate = new Date(potAnalysis.nextWaterDate);
    nextDate.setHours(targetHour, targetMinute, 0, 0);

    const year = nextDate.getFullYear();
    const month = String(nextDate.getMonth() + 1).padStart(2, '0');
    const day = String(nextDate.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;

    const base = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
    const taskUrl = `${base}?view=tasks&date=${dateKey}`;

    const title = `🪴 Toca regar: ${potAnalysis.potName}`;
    const description = [
      `Plan de riego para ${potAnalysis.potName}:`,
      `• Humedad actual: ${potAnalysis.soilMoisturePercent}%`,
      `• Recomendación: ${potAnalysis.actionDescription}`,
      `• Horario idóneo: ${potAnalysis.bestTimeOfDay}`,
      potAnalysis.balconyNotice ? `• Nota balcón: ${potAnalysis.balconyNotice}` : '',
      '',
      `👉 Lista de tareas de riego: ${taskUrl}`,
      'Generado por HidroBalcón PWA'
    ].filter(Boolean).join('\n');

    const ics = this.generateICalendar([
      {
        title,
        description,
        startDate: nextDate,
        taskUrl,
        durationMinutes: 20,
        alarmMinutesBefore: 0
      }
    ]);

    this.downloadICS(ics, `riego-${potAnalysis.potId}.ics`);
  }
}

export const alarmService = new AlarmService();
