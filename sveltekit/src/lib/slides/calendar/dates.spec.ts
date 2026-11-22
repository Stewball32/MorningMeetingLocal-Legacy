import { describe, expect, it } from 'vitest';
import { dateOf, weekLabels } from './dates.ts';

/** How MonthView lays out a month (a Sunday-first grid). */
const layout = (year: number, month: number) => ({
	startDay: new Date(year, month, 1).getDay(),
	daysInMonth: new Date(year, month + 1, 0).getDate()
});

describe('dateOf', () => {
	it('gives local midnight', () => {
		const date = dateOf('2026-11-23')!;
		expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
			2026, 10, 23, 0
		]);
	});

	it('refuses impossible or badly formatted dates', () => {
		expect(dateOf('2026-02-30')).toBeUndefined();
		expect(dateOf('2026-1-5')).toBeUndefined();
		expect(dateOf('')).toBeUndefined();
		expect(dateOf(undefined)).toBeUndefined();
	});
});

describe('weekLabels', () => {
	const rowsOf = (startDay: number, daysInMonth: number) => Math.ceil((daysInMonth + startDay) / 7);

	it('has one entry per grid row (the header first), for every month of several years', () => {
		for (let year = 2026; year <= 2030; year++) {
			for (let month = 0; month < 12; month++) {
				const { startDay, daysInMonth } = layout(year, month);
				expect(weekLabels(startDay, daysInMonth)).toHaveLength(1 + rowsOf(startDay, daysInMonth));
			}
		}
	});

	it('labels the last week of a month that starts on Monday (June 2026)', () => {
		const { startDay, daysInMonth } = layout(2026, 5);
		expect(startDay).toBe(1);
		expect(weekLabels(startDay, daysInMonth)).toEqual([null, 0, 1, 2, 3, 4]);
	});

	it('labels every week of a month that starts on Sunday (November 2026)', () => {
		const { startDay, daysInMonth } = layout(2026, 10);
		expect(weekLabels(startDay, daysInMonth)).toEqual([null, 0, 1, 2, 3, 4]);
	});

	it('leaves a short first week unlabeled (August 2026 starts on Saturday)', () => {
		const { startDay, daysInMonth } = layout(2026, 7);
		expect(startDay).toBe(6);
		expect(weekLabels(startDay, daysInMonth)).toEqual([null, null, 0, 1, 2, 3, 4]);
	});

	it('never needs more than six ordinals', () => {
		for (let startDay = 0; startDay < 7; startDay++) {
			for (const days of [28, 29, 30, 31]) {
				const labels = weekLabels(startDay, days).filter((label) => label !== null);
				expect(Math.max(...labels)).toBeLessThan(6);
			}
		}
	});
});
