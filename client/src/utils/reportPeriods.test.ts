import { presetPeriod } from './reportPeriods.js';

describe('presetPeriod', () => {
  const today = new Date(2026, 2, 15); // 15 March 2026

  it('runs from the first of the month to today', () => {
    expect(presetPeriod('thisMonth', today)).toEqual({ from: '2026-03-01', to: '2026-03-15' });
  });

  it('covers the whole previous month, also across a year change', () => {
    expect(presetPeriod('lastMonth', today)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(presetPeriod('lastMonth', new Date(2026, 0, 10))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('starts the last 3 months on the first of the month two months back', () => {
    expect(presetPeriod('last3Months', today)).toEqual({ from: '2026-01-01', to: '2026-03-15' });
    expect(presetPeriod('last3Months', new Date(2026, 1, 3))).toEqual({ from: '2025-12-01', to: '2026-02-03' });
  });

  it('runs from 1 January to today', () => {
    expect(presetPeriod('thisYear', today)).toEqual({ from: '2026-01-01', to: '2026-03-15' });
  });
});
