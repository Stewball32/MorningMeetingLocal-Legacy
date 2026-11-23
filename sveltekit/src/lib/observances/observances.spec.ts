import { describe, expect, it } from 'vitest';
import { builtInHolidays } from '#lib/pb/calendar.ts';
import type { CalendarObservance, IconRecord } from '#lib/pb/types.ts';
import { dayString } from './dates';
import {
	builtInRows,
	comingUp,
	iconLookup,
	nextDayLabel,
	ownGroups,
	scheduleText,
	schoolOf,
	schoolYear,
	settingsRecordsFor,
	slug
} from './observances';

let created = 0;
function record(fields: Partial<CalendarObservance>): CalendarObservance {
	created++;
	return {
		id: `rec${String(created).padStart(12, '0')}`,
		collectionId: 'pbc_326962381',
		collectionName: 'calendar_observances',
		created: `2026-01-01 00:00:00.${String(created).padStart(3, '0')}Z`,
		updated: '',
		name: '',
		description: '',
		is_active: true,
		dates: [],
		image: '',
		icon: '',
		hidden: false,
		school: '',
		...fields
	} as CalendarObservance;
}

const TODAY = new Date(2026, 10, 22, 9); // Sun Nov 22, 2026
const holidays = builtInHolidays(2025, 10);
const noIcons = iconLookup([]);

describe('schoolYear', () => {
	it('runs from August 1 to July 31', () => {
		expect(schoolYear(TODAY)).toEqual({
			start: new Date(2026, 7, 1),
			end: new Date(2027, 7, 1),
			label: '2026–27'
		});
		expect(schoolYear(new Date(2027, 6, 31, 23)).label).toBe('2026–27');
		expect(schoolYear(new Date(2027, 7, 1)).label).toBe('2027–28');
		expect(schoolYear(new Date(2099, 11, 1)).label).toBe('2099–00');
	});
});

describe('schoolOf', () => {
	it("reads '' (never set) as the fallback", () => {
		expect(schoolOf('', 'none')).toBe('none');
		expect(schoolOf('')).toBe('full');
		expect(schoolOf('short', 'none')).toBe('short');
	});
});

describe('builtInRows', () => {
	const rows = builtInRows(holidays, [], TODAY, noIcons);
	const row = (name: string) => rows.find((r) => r.holiday.name === name)!;

	it('lists every built-in holiday once, in school-year order, Election Day last', () => {
		expect(rows).toHaveLength(holidays.length);
		expect(rows[0].holiday.name).toBe('Labor Day');
		expect(rows.at(-1)?.holiday.name).toBe('Election Day');
		const dates = rows.flatMap((r) => (r.date ? [r.date.getTime()] : []));
		expect(dates).toEqual([...dates].sort((a, b) => a - b));
	});

	it('gives the day this school year, the observed weekday, and the next day when there is none', () => {
		expect(dayString(row('Thanksgiving Day').date!)).toBe('2026-11-26');
		expect(dayString(row('Independence Day').date!)).toBe('2027-07-04');
		expect(dayString(row('Independence Day').observed!)).toBe('2027-07-05');
		expect(dayString(row('Juneteenth').observed!)).toBe('2027-06-18');
		expect(row('Election Day').date).toBeNull();
		expect(dayString(row('Election Day').next!)).toBe('2028-11-07');
		expect(row('Veterans Day')).toMatchObject({ school: 'none', hidden: false, picture: '' });
	});

	it("shows the class's changes, and which record the editor changes", () => {
		const older = record({ name: 'Tax Day', hidden: false, created: '2026-01-01 00:00:00.000Z' });
		const newer = record({
			name: 'Tax Day',
			hidden: true,
			image: 'tax.png',
			created: '2026-02-01 00:00:00.000Z'
		});
		const off = record({ name: 'Veterans Day', school: 'short', is_active: false });
		const custom = record({ name: 'Tax Day', dates: ['2027-04-16'] });
		const result = builtInRows(holidays, [older, newer, off, custom], TODAY, noIcons);
		const tax = result.find((r) => r.holiday.name === 'Tax Day')!;
		expect(tax.record?.id).toBe(newer.id);
		expect(tax.extra.map((r) => r.id)).toEqual([older.id]);
		expect(tax.hidden).toBe(true);
		expect(tax.picture).toContain('tax.png');
		const veterans = result.find((r) => r.holiday.name === 'Veterans Day')!;
		// an inactive record is the one to change, but it changes nothing
		expect(veterans.record?.id).toBe(off.id);
		expect(veterans.school).toBe('none');
	});
});

describe('settingsRecordsFor', () => {
	it('puts the newest active record first, then the inactive ones', () => {
		const a = record({ name: 'Halloween', created: '2026-01-01 00:00:00.000Z' });
		const b = record({ name: 'Halloween', is_active: false, created: '2026-03-01 00:00:00.000Z' });
		const c = record({ name: 'Halloween ', created: '2026-02-01 00:00:00.000Z' });
		const own = record({ name: 'Halloween', dates: ['10-30'] });
		expect(settingsRecordsFor([a, b, c, own], 'Halloween').map((r) => r.id)).toEqual([
			c.id,
			a.id,
			b.id
		]);
	});
});

describe('ownGroups', () => {
	it('splits the records into days to come, past days and records the calendar ignores', () => {
		const soon = record({ name: 'Minimum Day', dates: ['2026-11-25'] });
		const later = record({ name: 'Field Trip', dates: ['2027-03-02'] });
		const yearly = record({ name: 'Book Fair', dates: ['11-19'] }); // next: Nov 19, 2027
		const today = record({ name: 'Today', dates: ['2026-11-22'] });
		const past = record({ name: 'Picture Day', dates: ['2026-09-10', '2026-10-01'] });
		const older = record({ name: 'Old', dates: ['2025-05-01'] });
		const odd = record({ name: 'Odd', dates: [42] as unknown as string[] });
		const orphan = record({ name: 'day after thanksgiving day' });
		const settings = record({ name: 'Veterans Day', school: 'short' });
		const duplicate = record({ name: 'Veterans Day', created: '2025-01-01 00:00:00.000Z' });
		const groups = ownGroups(
			[soon, later, yearly, today, past, older, odd, orphan, settings, duplicate],
			holidays,
			TODAY
		);
		expect(groups.upcoming.map((r) => r.record.name)).toEqual([
			'Today',
			'Minimum Day',
			'Field Trip',
			'Book Fair',
			'Odd'
		]);
		// The calendar can't read it: it stays with the days to come, to be fixed.
		expect(groups.upcoming.at(-1)?.unreadable).toBe(1);
		expect(groups.past.map((r) => r.record.name)).toEqual(['Picture Day', 'Old']);
		expect(groups.attention.map((r) => r.record.id)).toEqual([duplicate.id, orphan.id]);
		expect(groups.attention[1].reason).toMatch(/no built-in holiday is called/);
		expect(groups.attention[0].reason).toMatch(/Another set of changes to Veterans Day/);
	});

	it('puts rules at their real next day, read or not by the editor, and only unreadable ones apart', () => {
		const goodFriday = record({ name: 'Good Friday', dates: ['easter -2'] }); // Fri Mar 26, 2027
		const mlk = record({ name: 'Teacher Day', dates: ['1st Tuesday in May'] }); // Tue May 4, 2027
		const even = record({ name: 'Even', dates: ['03-02 in even years'] }); // Thu Mar 2, 2028
		const soon = record({
			name: 'Soon',
			dates: ['2026-12-01', 'Wednesday before 4th Thursday in November']
		});
		const gone = record({ name: 'Gone', dates: ['11-20 prior to 2020'] });
		const broken = record({ name: 'Broken', dates: ['nonsense', 'easter -2'] });
		const groups = ownGroups([goodFriday, mlk, even, soon, gone, broken], holidays, TODAY);
		expect(
			groups.upcoming.map((r) => `${r.record.name} ${r.next && dayString(r.next)} ${r.unreadable}`)
		).toEqual([
			'Soon 2026-11-25 0',
			'Broken 2027-03-26 1',
			'Good Friday 2027-03-26 0',
			'Teacher Day 2027-05-04 0',
			'Even 2028-03-02 0'
		]);
		expect(groups.past.map((r) => r.record.name)).toEqual(['Gone']);
		expect(scheduleText(groups.upcoming[2].entries)).toBe('Every year 2 days before Easter Sunday');
		expect(scheduleText(groups.upcoming[0].entries)).toBe(
			'Tue, Dec 1, 2026 · Every year on the Wednesday before the 4th Thursday in November'
		);
	});

	it('gives a next day a year or more away its year', () => {
		expect(nextDayLabel(new Date(2026, 10, 23), TODAY)).toBe('Tomorrow');
		expect(nextDayLabel(new Date(2027, 10, 21), TODAY)).toBe('Sun, Nov 21');
		expect(nextDayLabel(new Date(2027, 10, 22), TODAY)).toBe('Mon, Nov 22, 2027');
		expect(nextDayLabel(new Date(2040, 10, 20), TODAY)).toBe('Tue, Nov 20, 2040');
	});

	it("doesn't call a dashboard rule that starts after the next 10 years past", () => {
		const later = record({ name: 'Later', dates: ['11-20 since 2040'] });
		const old = record({ name: 'Old rule', dates: ['2015-05-04 if Saturday then next Monday'] });
		const groups = ownGroups([later, old], holidays, TODAY);
		expect(groups.upcoming.map((r) => `${r.record.name} ${r.next && dayString(r.next)}`)).toEqual([
			'Later 2040-11-20'
		]);
		expect(groups.upcoming[0].unreadable).toBe(0);
		// So "Delete all past observances" leaves it.
		expect(groups.past.map((r) => r.record.name)).toEqual(['Old rule']);
	});

	it('keeps a day earlier this month with the days to come: the month page still shows it', () => {
		const earlier = record({ name: 'Minimum Day', dates: ['2026-11-02'] });
		const lastMonth = record({ name: 'Picture Day', dates: ['2026-10-30'] });
		const groups = ownGroups([earlier, lastMonth], holidays, TODAY);
		expect(groups.upcoming.map((r) => r.record.name)).toEqual(['Minimum Day']);
		expect(groups.upcoming[0].next).toBeNull();
		expect(groups.past.map((r) => r.record.name)).toEqual(['Picture Day']);
	});
});

describe('scheduleText', () => {
	it('names the days in a few words', () => {
		const { upcoming } = ownGroups(
			[
				record({ name: 'One', dates: ['2026-11-25'] }),
				record({ name: 'Two', dates: ['2026-12-01', '12-24'] }),
				record({
					name: 'Break',
					dates: ['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-28', '2027-01-01']
				})
			],
			holidays,
			TODAY
		);
		expect(upcoming.map((row) => scheduleText(row.entries))).toEqual([
			'Wed, Nov 25, 2026',
			'Tue, Dec 1, 2026 · Every year on Dec 24',
			'5 days, Mon, Dec 21, 2026 to Fri, Jan 1, 2027'
		]);
		expect(scheduleText([])).toBe('No days');
	});
});

describe('comingUp', () => {
	it('lists the next 60 days like the slide, built-in and own together', () => {
		const minimum = record({ name: 'Minimum Day', dates: ['2026-11-25'], school: 'short' });
		const hide = record({ name: 'Day after Thanksgiving Day', hidden: true });
		const days = comingUp([minimum, hide], TODAY, noIcons);
		expect(
			days.map(
				(day) => `${dayString(day.date)} ${day.school} ${day.observances.map((o) => o.name)}`
			)
		).toEqual([
			'2026-11-25 short Minimum Day',
			'2026-11-26 none Thanksgiving Day',
			'2026-12-24 full Christmas Eve',
			'2026-12-25 none Christmas Day',
			"2026-12-31 full New Year's Eve",
			"2027-01-01 none New Year's Day",
			'2027-01-18 none Martin Luther King Jr. Day'
		]);
		expect(comingUp([], TODAY, noIcons, 1)).toEqual([]);
	});

	it('includes the observed weekday (Veterans Day 2028 on Fri Nov 10)', () => {
		const days = comingUp([], new Date(2028, 10, 1), noIcons, 15);
		expect(days.map((day) => `${dayString(day.date)} ${day.school}`)).toEqual([
			'2028-11-07 full',
			'2028-11-10 none',
			'2028-11-11 none'
		]);
	});

	it('uses the live icons for pictures', () => {
		const turkey = {
			id: 'icon00000000001',
			collectionId: 'pbc_423132189',
			image: 'new.png'
		} as IconRecord;
		const feast = record({ name: 'Feast', dates: ['2026-11-24'], icon: turkey.id });
		const [day] = comingUp([feast], TODAY, iconLookup([turkey]), 3);
		expect(day.observances[0].image).toContain('/icon00000000001/new.png');
	});
});

describe('slug', () => {
	it('makes a safe key', () => {
		expect(slug("New Year's Day")).toBe('new-year-s-day');
		expect(slug('Martin Luther King Jr. Day')).toBe('martin-luther-king-jr-day');
	});
});
