import { describe, it, expect } from 'vitest';
import { generatePotAnalyticsTimeline } from '../src/services/analyticsService.js';

describe('analyticsService - generatePotAnalyticsTimeline', () => {
  const dummyPot = {
    id: 'pot-test-1',
    name: 'Albahaca Balcón',
    plantType: 'vegetable',
    material: 'terracotta',
    size: 'small',
    sunExposure: 'full_sun',
    isCovered: false,
    lastWatered: '2026-11-01T10:00:00Z',
    learnedDryingFactor: 1.0
  };

  const dummyWeather = {
    allDays: [
      { date: '2026-10-29', maxTemp: 22, minTemp: 10, rainSum: 0, et0: 3.2 },
      { date: '2026-10-30', maxTemp: 21, minTemp: 9, rainSum: 0, et0: 3.0 },
      { date: '2026-10-31', maxTemp: 19, minTemp: 8, rainSum: 5, et0: 2.5 },
      { date: '2026-11-01', maxTemp: 20, minTemp: 7, rainSum: 0, et0: 2.8 },
      { date: '2026-11-02', maxTemp: 18, minTemp: 6, rainSum: 0, et0: 2.4 },
      { date: '2026-11-03', maxTemp: 17, minTemp: 5, rainSum: 0, et0: 2.2 },
      { date: '2026-11-04', maxTemp: 16, minTemp: 1, rainSum: 0, et0: 2.0 }, // helada
      { date: '2026-11-05', maxTemp: 18, minTemp: 4, rainSum: 0, et0: 2.1 }
    ]
  };

  const dummyLogs = [
    {
      id: 'log-1',
      potId: 'pot-test-1',
      date: '2026-10-30T09:00:00Z',
      notes: 'Riego normal'
    }
  ];

  it('genera correctamente los puntos temporales y detecta riegos y heladas', () => {
    const timeline = generatePotAnalyticsTimeline(dummyPot, dummyWeather, {}, dummyLogs);
    expect(timeline).toBeDefined();
    expect(timeline.days.length).toBe(8);

    const oct30 = timeline.days.find(d => d.date === '2026-10-30');
    expect(oct30).toBeDefined();
    expect(oct30.wateringEvent).not.toBeNull();
    expect(oct30.wateringEvent.type).toBe('real');

    const nov4 = timeline.days.find(d => d.date === '2026-11-04');
    expect(nov4.isFrostDay).toBe(true);
    expect(timeline.summary.frostDaysCount).toBeGreaterThanOrEqual(1);
  });
});
