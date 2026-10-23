import { describe, it, expect } from 'vitest';
import { AlarmService } from '../src/services/alarmService.js';
import { SIMULATION_SCENARIOS, simulatorService } from '../src/services/simulatorService.js';

describe('Servicios Auxiliares: Alarmas y Simulación', () => {
  it('genera correctamente un archivo .ics con formato iCalendar estándar y alarma VALARM', () => {
    const alarmService = new AlarmService();
    const ics = alarmService.generateICalendar({
      title: '🪴 Regar Tomates',
      description: 'Humedad al 20%, regar temprano.',
      startDate: new Date('2026-06-10T08:00:00Z'),
      durationMinutes: 15,
      alarmMinutesBefore: 0
    });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:🪴 Regar Tomates');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-PT0M');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('los escenarios de simulación contienen datos coherentes para pruebas agronómicas', () => {
    const heatwave = SIMULATION_SCENARIOS.HEATWAVE_SUMMER;
    expect(heatwave.data.maxTemp).toBeGreaterThan(35);
    expect(heatwave.data.et0).toBeGreaterThan(6.0);

    const frost = SIMULATION_SCENARIOS.FROST_WINTER;
    expect(frost.data.minTemp).toBeLessThanOrEqual(0);

    const storm = SIMULATION_SCENARIOS.RAIN_STORM_AUTUMN;
    expect(storm.data.rainSum).toBeGreaterThan(20);
  });
});
