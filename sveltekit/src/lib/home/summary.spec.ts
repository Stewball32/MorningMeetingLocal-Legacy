import Holidays from 'date-holidays';
import { describe, expect, it } from 'vitest';
import {
	dayLabel,
	iconsSummary,
	monthsFrom,
	peopleSummary,
	schoolBadge,
	upcomingDays,
	type ObservedDay
} from './summary.ts';

const person = (role: 'student' | 'teacher', is_guest = false, active = true) => ({
	role,
	is_guest,
	active
});

describe('peopleSummary', () => {
	it('counts the active students, teachers and regular guests', () => {
		const people = [
			...Array.from({ length: 14 }, () => person('student')),
			...Array.from({ length: 3 }, () => person('teacher')),
			person('teacher', true),
			person('student', true)
		];
		expect(peopleSummary(people)).toBe('14 students · 3 teachers · 2 regular guests');
	});

	it('adds the inactive ones, and says so when there is nobody', () => {
		expect(peopleSummary([person('student'), person('teacher', false, false)])).toBe(
			'1 student · 0 teachers · 1 inactive'
		);
		expect(peopleSummary([person('student', true, false)])).toBe(
			'0 students · 0 teachers · 1 inactive'
		);
		expect(peopleSummary([])).toBe('No people yet');
	});
});

describe('iconsSummary', () => {
	it('counts the icons for each use', () => {
		const icons = [
			...Array.from({ length: 11 }, () => ({ for_guests: true, for_calendar: false })),
			{ for_guests: true, for_calendar: true },
			{ for_guests: false, for_calendar: false }
		];
		expect(iconsSummary(icons)).toBe('12 for guests · 1 for the calendar');
		expect(iconsSummary([])).toBe('No icons yet');
	});
});

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const observed = (name: string, date: Date, school = 'full'): ObservedDay => ({
	name,
	dateObj: date,
	school
});

describe('upcomingDays', () => {
	const today = new Date(2026, 10, 22, 9, 30); // Sun Nov 22 2026, 9:30

	it('picks the next days with observances, today included, soonest first', () => {
		const days = upcomingDays(
			[
				observed('Christmas Day', day(2026, 12, 25), 'none'),
				observed('Veterans Day', day(2026, 11, 11), 'none'), // past
				observed('Book Week', day(2026, 11, 22)),
				observed('Thanksgiving Day', day(2026, 11, 26), 'none'),
				observed('Day after Thanksgiving Day', day(2026, 11, 27))
			],
			today
		);
		expect(days.map((d) => [d.date.getDate(), d.names, d.school])).toEqual([
			[22, ['Book Week'], 'full'],
			[26, ['Thanksgiving Day'], 'none'],
			[27, ['Day after Thanksgiving Day'], 'full']
		]);
	});

	it('puts several observances of a day together, with the badge the slide shows', () => {
		const days = upcomingDays(
			[
				observed('Christmas Eve', day(2026, 12, 24)),
				observed('Half day', day(2026, 12, 24), 'short'),
				observed('Party', day(2026, 12, 23), 'short'),
				observed('Winter break', day(2026, 12, 23), 'none'),
				observed('Party', day(2026, 12, 23), 'short')
			],
			today,
			2
		);
		expect(days.map((d) => [d.date.getDate(), d.names, d.school])).toEqual([
			[23, ['Party', 'Winter break'], 'none'],
			[24, ['Christmas Eve', 'Half day'], 'short']
		]);
	});

	it('treats an unset school like a regular day', () => {
		expect(upcomingDays([observed('Notes only', day(2026, 11, 30), '')], today)[0].school).toBe(
			'full'
		);
	});

	it("reads date-holidays' days as local days (Thanksgiving 2026 is Thu Nov 26)", () => {
		const list = new Holidays('US').getHolidays(2026).map((h) => ({
			name: h.name,
			dateObj: new Date(h.date),
			school: h.type === 'public' ? 'none' : 'full'
		}));
		const [first] = upcomingDays(list, today, 1);
		expect(first.names).toEqual(['Thanksgiving Day']);
		expect([first.date.getMonth(), first.date.getDate(), first.date.getDay()]).toEqual([10, 26, 4]);
	});
});

describe('dayLabel', () => {
	const today = new Date(2026, 10, 22, 23, 59);
	it('says today and tomorrow, otherwise the short date', () => {
		expect(dayLabel(day(2026, 11, 22), today)).toBe('Today');
		expect(dayLabel(day(2026, 11, 23), today)).toBe('Tomorrow');
		expect(dayLabel(day(2026, 11, 26), today)).toBe('Thu, Nov 26');
		expect(dayLabel(day(2027, 1, 1), today)).toBe('Fri, Jan 1');
	});
});

describe('schoolBadge', () => {
	it("uses the slide's badges", () => {
		expect(schoolBadge('none')).toBe('No school');
		expect(schoolBadge('short')).toBe('Short day');
		expect(schoolBadge('full')).toBe('');
	});
});

describe('monthsFrom', () => {
	it('goes on into the next year', () => {
		expect(monthsFrom(new Date(2026, 10, 30), 3)).toEqual([
			{ year: 2026, month: 10 },
			{ year: 2026, month: 11 },
			{ year: 2027, month: 0 }
		]);
	});
});
