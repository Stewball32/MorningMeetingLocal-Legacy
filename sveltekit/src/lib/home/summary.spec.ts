import Holidays from 'date-holidays';
import { describe, expect, it } from 'vitest';
import { observancesForMonth } from '#lib/pb/calendar.ts';
import type { CalendarObservance } from '#lib/pb/types.ts';
import {
	dayLabel,
	iconsSummary,
	monthsFrom,
	nextBirthdaySummary,
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

	it("shows a built-in holiday's other name first, with its own name after it", () => {
		const days = upcomingDays(
			[
				{ ...observed('Turkey Day', day(2026, 11, 26), 'none'), holiday: 'Thanksgiving Day' },
				{ ...observed('Class Feast', day(2026, 11, 26)) },
				{ ...observed('Veterans Day', day(2026, 11, 27)), holiday: 'Veterans Day' },
				{
					...observed('Vets Day (observed)', day(2026, 11, 30), 'none'),
					holiday: 'Veterans Day',
					observed: true
				}
			],
			today
		);
		expect(days.map((d) => d.names)).toEqual([
			['Turkey Day (Thanksgiving Day)', 'Class Feast'],
			['Veterans Day'],
			['Vets Day (Veterans Day, observed)']
		]);
	});

	it('puts "observed" in the brackets for a renamed holiday\'s weekday off (as the slide names it)', () => {
		// Independence Day 2026 is on a Saturday: observed on Friday, July 3
		const fourth = {
			id: 'rec000000000001',
			collectionId: 'pbc_326962381',
			collectionName: 'calendar_observances',
			created: '2026-01-01 00:00:00.000Z',
			updated: '',
			name: 'Independence Day',
			display_name: 'Fourth of July',
			description: '',
			is_active: true,
			dates: [],
			image: '',
			icon: '',
			hidden: false,
			school: ''
		} as CalendarObservance;
		const july = [...observancesForMonth([fourth], 2026, 6).values()].flat();
		expect(upcomingDays(july, new Date(2026, 6, 1), 2).map((d) => d.names)).toEqual([
			['Fourth of July (Independence Day, observed)'],
			['Fourth of July (Independence Day)']
		]);
		// under its own name, it reads as the slide shows it
		const plain = [...observancesForMonth([], 2026, 6).values()].flat();
		expect(upcomingDays(plain, new Date(2026, 6, 1), 2).map((d) => d.names)).toEqual([
			['Independence Day (observed)'],
			['Independence Day']
		]);
	});
});

describe('the Calendar Observances tile, with movable days, another name and birthdays', () => {
	const record = (id: number, fields: Partial<CalendarObservance>) =>
		({
			id: `rec${String(id).padStart(12, '0')}`,
			collectionId: 'pbc_326962381',
			collectionName: 'calendar_observances',
			created: `2026-01-01 00:00:0${id}.000Z`,
			updated: '',
			name: '',
			display_name: '',
			description: '',
			is_active: true,
			dates: [],
			image: '',
			icon: '',
			hidden: false,
			school: '',
			...fields
		}) as CalendarObservance;
	const records = [
		record(1, { name: 'Thanksgiving Day', display_name: 'Turkey Day' }),
		record(2, { name: 'Family Feast', dates: ['4th Thursday in November'] }),
		record(3, { name: 'Leftovers Day', dates: ['Friday after 4th Thursday in November'] })
	];
	const today = new Date(2026, 10, 22, 9, 30); // Sun Nov 22, 2026

	it('lists the days as the slide shows them, and the next birthday on its own line', () => {
		// What Home does: the observances without people, then the birthdays apart.
		const november = [...observancesForMonth(records, 2026, 10).values()].flat();
		expect(upcomingDays(november, today).map((d) => [d.date.getDate(), d.names, d.school])).toEqual(
			[
				[26, ['Turkey Day (Thanksgiving Day)', 'Family Feast'], 'none'],
				[27, ['Day after Thanksgiving Day', 'Leftovers Day'], 'full']
			]
		);
		const people = [
			{
				id: 'per000000000001',
				collectionId: 'pbc_1795321340',
				name: 'Bluey',
				title: '',
				avatar: '',
				active: true,
				birthday: '11-26'
			}
		];
		expect(nextBirthdaySummary(people, today)).toBe('Next birthday: Bluey, Thu, Nov 26');
	});
});

describe('nextBirthdaySummary', () => {
	const today = new Date(2026, 10, 22, 9, 30);
	const person = (name: string, birthday: string, fields = {}) => ({
		id: `per${name.padEnd(12, '0')}`,
		collectionId: 'pbc_1795321340',
		name,
		title: '',
		avatar: '',
		active: true,
		birthday,
		...fields
	});

	it('names the next birthday and its day', () => {
		expect(nextBirthdaySummary([person('Bingo', '12-03'), person('Bluey', '11-30')], today)).toBe(
			'Next birthday: Bluey, Mon, Nov 30'
		);
		expect(nextBirthdaySummary([person('Bluey', '11-22')], today)).toBe(
			'Next birthday: Bluey, today'
		);
		expect(nextBirthdaySummary([person('Smith', '11-23', { title: 'Mr.' })], today)).toBe(
			'Next birthday: Mr. Smith, tomorrow'
		);
		// it has passed this year: next year's
		expect(nextBirthdaySummary([person('Bluey', '11-21')], today)).toBe(
			'Next birthday: Bluey, Sun, Nov 21'
		);
	});

	it('lists everyone who shares it, and counts only active people', () => {
		expect(
			nextBirthdaySummary(
				[
					person('Muffin', '11-24', { active: false }),
					person('Bluey', '11-30'),
					person('Bingo', '11-30'),
					person('Chilli', '11-30')
				],
				today
			)
		).toBe('Next birthdays: Bingo, Bluey and Chilli, Mon, Nov 30');
		expect(nextBirthdaySummary([person('Muffin', '11-24', { active: false })], today)).toBe('');
		expect(nextBirthdaySummary([], today)).toBe('');
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
