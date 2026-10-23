import { describe, it, expect } from 'vitest';
import { AlarmService } from '../src/services/alarmService.js';

describe('Consolidación de Alarmas y Vista de Tareas', () => {
  const alarmService = new AlarmService();

  const mockPots = [
    {
      id: 'pot-1',
      name: 'Tomates Cherry',
      calc: {
        potId: 'pot-1',
        nextWaterDate: new Date('2026-10-25T07:00:00Z'),
        soilMoisturePercent: 15,
        status: 'urgent',
        actionTitle: 'Riego Urgente',
        bestTimeOfDay: 'Primera hora de la mañana',
        plantType: { icon: '🍅' }
      }
    },
    {
      id: 'pot-2',
      name: 'Geranios',
      calc: {
        potId: 'pot-2',
        nextWaterDate: new Date('2026-10-25T09:00:00Z'), // Mismo día que tomates
        soilMoisturePercent: 28,
        status: 'due',
        actionTitle: 'Regar pronto',
        bestTimeOfDay: 'Primera hora de la mañana',
        plantType: { icon: '🌸' }
      }
    },
    {
      id: 'pot-3',
      name: 'Limonero',
      calc: {
        potId: 'pot-3',
        nextWaterDate: new Date('2026-10-28T08:00:00Z'), // Día posterior
        soilMoisturePercent: 55,
        status: 'good',
        actionTitle: 'Humedad adecuada',
        bestTimeOfDay: 'Primera hora de la mañana',
        plantType: { icon: '🍋' }
      }
    },
    {
      id: 'pot-frozen',
      name: 'Planta Helada',
      calc: {
        potId: 'pot-frozen',
        nextWaterDate: new Date('2026-10-25T08:00:00Z'),
        soilMoisturePercent: 10,
        status: 'frozen_hold', // Alerta helada activa
        actionTitle: 'SUSPENDER RIEGO',
        bestTimeOfDay: 'Mediodía',
        plantType: { icon: '❄️' }
      }
    }
  ];

  it('agrupa macetas que coinciden en el mismo día en una única alarma conjunta', () => {
    const groups = alarmService.groupPotsByWateringDay(mockPots, 'https://hidrobalcon.app/');

    // Deben quedar 2 días de riego (el 25 de octubre y el 28 de octubre)
    expect(groups.length).toBe(2);

    // El día 2026-10-25 debe agrupar a Tomates y Geranios (2 macetas)
    const dayOct25 = groups.find(g => g.dateKey === '2026-10-25');
    expect(dayOct25).toBeDefined();
    expect(dayOct25.count).toBe(2);
    expect(dayOct25.potNames).toContain('Tomates Cherry');
    expect(dayOct25.potNames).toContain('Geranios');
    expect(dayOct25.title).toContain('2 macetas');

    // La planta en frozen_hold NO debe incluirse en la alarma
    expect(dayOct25.potNames).not.toContain('Planta Helada');
  });

  it('incluye el enlace directo a la vista de tareas en el archivo .ics', () => {
    const groups = alarmService.groupPotsByWateringDay(mockPots, 'https://hidrobalcon.app/');
    const dayOct25 = groups[0];

    const ics = alarmService.generateICalendar([
      {
        title: dayOct25.title,
        description: `Lista:\n• Tomates\n• Geranios\n\nURL:${dayOct25.taskUrl}`,
        startDate: dayOct25.dateObj,
        taskUrl: dayOct25.taskUrl,
        durationMinutes: 20,
        alarmMinutesBefore: 0
      }
    ]);

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:🪴 Riego Terraza (2 macetas)');
    expect(ics).toContain('URL:https://hidrobalcon.app/?view=tasks&date=2026-10-25');
    expect(ics).toContain('BEGIN:VALARM');
  });

  it('genera un calendario completo semanal con múltiples VEVENT si hay varios días', () => {
    const groups = alarmService.groupPotsByWateringDay(mockPots, 'https://hidrobalcon.app/');
    const ics = alarmService.exportFullSchedule(groups);

    // Contiene 2 bloques VEVENT (uno para cada día con tareas)
    const countVEvent = (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(countVEvent).toBe(2);
    expect(ics).toContain('2026-10-25');
    expect(ics).toContain('2026-10-28');
  });
});
