import { describe, it, expect } from 'vitest';
import { getZodiacSign } from './zodiac';

// Independent reference: first day of each sign as [month (1-12), day].
const signStarts: [string, number, number][] = [
	['Capricorn', 12, 22],
	['Aquarius', 1, 20],
	['Pisces', 2, 19],
	['Aries', 3, 21],
	['Taurus', 4, 20],
	['Gemini', 5, 21],
	['Cancer', 6, 21],
	['Leo', 7, 23],
	['Virgo', 8, 23],
	['Libra', 9, 23],
	['Scorpio', 10, 23],
	['Sagittarius', 11, 22]
];

const expectedSign = (date: Date) => {
	const key = (date.getMonth() + 1) * 100 + date.getDate();
	let sign = 'Capricorn'; // Jan 1 to Jan 19 wraps from December
	for (const [name, month, day] of signStarts) {
		if (month * 100 + day <= key && name !== 'Capricorn') sign = name;
	}
	if (key >= 1222) sign = 'Capricorn';
	return sign;
};

describe('getZodiacSign', () => {
	it('matches the reference for every day of a leap year', () => {
		for (let d = new Date(2024, 0, 1); d.getFullYear() === 2024; d.setDate(d.getDate() + 1)) {
			const sign = getZodiacSign(d);
			expect(sign, d.toDateString()).toBeDefined();
			expect(sign[0], d.toDateString()).toBe(expectedSign(d));
		}
	});

	it('handles the December/January wrap (regression: undefined in December)', () => {
		expect(getZodiacSign(new Date(2025, 11, 21))[0]).toBe('Sagittarius');
		expect(getZodiacSign(new Date(2025, 11, 22))[0]).toBe('Capricorn');
		expect(getZodiacSign(new Date(2025, 11, 31))[0]).toBe('Capricorn');
		expect(getZodiacSign(new Date(2026, 0, 1))[0]).toBe('Capricorn');
		expect(getZodiacSign(new Date(2026, 0, 20))[0]).toBe('Aquarius');
	});

	it('returns an image file for every sign', () => {
		for (let m = 0; m < 12; m++) {
			expect(getZodiacSign(new Date(2025, m, 1))[1]).toMatch(/^[a-z]+\.png$/);
		}
	});
});
