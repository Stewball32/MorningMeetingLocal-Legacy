import { describe, expect, it } from 'vitest';
import { MoonPhase, SearchMoonQuarter, NextMoonQuarter } from 'astronomy-engine';
import { MOON_PHASES, moonPhaseDays } from './moon.ts';

const QUARTER_INDEX = [0, 2, 4, 6]; // New Moon, First Quarter, Full Moon, Last Quarter

/** astronomy-engine's principal phases in a month, as local day -> MOON_PHASES index. */
const quartersIn = (year: number, month: number) => {
	const days = new Map<number, number>();
	let quarter = SearchMoonQuarter(new Date(year, month, 1));
	while (quarter.time.date < new Date(year, month + 1, 1)) {
		const date = quarter.time.date;
		if (date.getMonth() === month) days.set(date.getDate(), QUARTER_INDEX[quarter.quarter]);
		quarter = NextMoonQuarter(quarter);
	}
	return days;
};

const principal = (days: Map<number, number>) =>
	new Map([...days].filter(([, index]) => QUARTER_INDEX.includes(index)));

describe('moonPhaseDays', () => {
	it('puts every New Moon, quarter and Full Moon on the local day SearchMoonQuarter gives', () => {
		// three school years, in whatever time zone the tests run in (TZ=America/Los_Angeles too)
		for (let year = 2026; year <= 2028; year++) {
			for (let month = 0; month < 12; month++) {
				expect(principal(moonPhaseDays(year, month)), `${year}-${month + 1}`).toEqual(
					quartersIn(year, month)
				);
			}
		}
	});

	it('shows each of the eight phases once per cycle, in order', () => {
		const sequence: number[] = [];
		for (let month = 0; month < 12; month++) {
			const days = moonPhaseDays(2027, month);
			for (const day of [...days.keys()].sort((a, b) => a - b)) sequence.push(days.get(day)!);
		}
		for (let i = 1; i < sequence.length; i++) {
			expect(sequence[i]).toBe((sequence[i - 1] + 1) % MOON_PHASES.length);
		}
	});

	it('places a phase on the day the angle passes it, also across 360 -> 0', () => {
		// a made-up moon moving 12 degrees a day, at 350 degrees on the 1st
		const start = new Date(2027, 0, 1).getTime();
		const angle = (date: Date) =>
			(350 + 12 * Math.round((date.getTime() - start) / 86_400_000)) % 360;
		const days = moonPhaseDays(2027, 0, angle);
		expect(days.get(1)).toBe(0); // 350 -> 2 passes 0: New Moon
		expect(days.get(5)).toBe(1); // 38 -> 50 passes 45
		expect(days.get(8)).toBeUndefined(); // 74 -> 86
		expect(days.get(9)).toBe(2); // 86 -> 98 passes 90
		expect(days.get(31)).toBe(0); // 350 again -> the next New Moon
	});

	it('leaves out a phase reached exactly at midnight on the next day (the previous day has it)', () => {
		const start = new Date(2027, 0, 1).getTime();
		const angle = (date: Date) =>
			(78 + 12 * Math.round((date.getTime() - start) / 86_400_000)) % 360;
		const days = moonPhaseDays(2027, 0, angle);
		expect(days.get(1)).toBe(2); // 78 -> 90: reached at the end of the 1st
		expect(days.get(2)).toBeUndefined(); // 90 -> 102
	});

	it('matches the real sky for November 2026 in Los Angeles', () => {
		const inLosAngeles = new Date(2026, 10, 24).getTimezoneOffset() === 480;
		if (!inLosAngeles) return; // run with TZ=America/Los_Angeles
		const days = principal(moonPhaseDays(2026, 10));
		expect(days.get(17)).toBe(2); // First Quarter, Nov 17 03:48
		expect(days.get(24)).toBe(4); // Full Moon, Nov 24 06:54
		expect(days.get(1)).toBe(6); // Last Quarter on the 1st
		expect(days.get(16)).toBeUndefined();
		expect(days.get(23)).toBeUndefined();
		expect(MoonPhase(new Date(2026, 10, 24)) < 180).toBe(true);
	});
});
