import { describe, it, expect } from 'vitest';
import Holidays from 'date-holidays';
import { isSameHolidayName } from './calendar';

describe('isSameHolidayName', () => {
	it('matches plain and typographic apostrophes', () => {
		expect(isSameHolidayName('Valentine’s Day', "Valentine's Day")).toBe(true);
		expect(isSameHolidayName("New Year's Day", 'New Year’s Day')).toBe(true);
		expect(isSameHolidayName('Thanksgiving Day', 'Thanksgiving Day ')).toBe(true);
		expect(isSameHolidayName('Thanksgiving Day', 'Day after Thanksgiving Day')).toBe(false);
	});

	it("matches every date-holidays US name when typed with a plain '", () => {
		for (const h of new Holidays('US').getHolidays(2026)) {
			expect(isSameHolidayName(h.name, h.name.replace(/’/g, "'")), h.name).toBe(true);
		}
	});
});
