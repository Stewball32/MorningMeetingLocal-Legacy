import { describe, it, expect } from 'vitest';
import Holidays from 'date-holidays';
import {
	builtInDays,
	builtInHolidays,
	defaultSchool,
	findBuiltIn,
	holidaySettings,
	isSameHolidayName,
	isSettingsRecord,
	localDay,
	observancePicture,
	observancesForMonth,
	rawDates,
	type Holiday
} from './calendar';
import type { CalendarObservance, IconRecord } from './types';

const PB = 'http://localhost:8090'; // vite.config.ts gives the tests this PocketBase URL

let created = 0;
/** An observance record as PocketBase returns it (active, nothing set). */
function record(fields: Partial<CalendarObservance>): CalendarObservance {
	created++;
	return {
		id: `rec${String(created).padStart(12, '0')}`,
		collectionId: 'pbc_326962381',
		collectionName: 'calendar_observances',
		created: `2026-01-01 00:00:${String(created % 60).padStart(2, '0')}.${String(created).padStart(3, '0')}Z`,
		updated: '',
		name: '',
		description: '',
		is_active: true,
		dates: [],
		image: '',
		icon: '',
		hidden: false,
		exceptions: null,
		school: '',
		...fields
	} as CalendarObservance;
}

function icon(fields: Partial<IconRecord>): IconRecord {
	return {
		id: 'icon00000000001',
		collectionId: 'pbc_423132189',
		collectionName: 'icons',
		name: 'Turkey',
		emoji: '🦃',
		image: 'turkey_abc.png',
		for_guests: false,
		for_calendar: true,
		...fields
	} as IconRecord;
}

/** "11: Veterans Day [none]" lines, for comparing a month at a glance. */
const lines = (map: Map<number, Holiday[]>) =>
	[...map]
		.sort(([a], [b]) => a - b)
		.flatMap(([day, list]) => list.map((h) => `${day}: ${h.name} [${h.school}]`));

const day = (map: Map<number, Holiday[]>, date: number) => map.get(date) ?? [];

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

describe('localDay', () => {
	it("reads date-holidays' date as the local day, whatever the time", () => {
		const date = localDay('2026-10-31 18:00:00');
		expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
			2026, 9, 31, 0
		]);
		expect(localDay('2026-11-26 00:00:00 -0500').getDate()).toBe(26);
	});
});

describe('builtInHolidays (the list the editor offers)', () => {
	const list = builtInHolidays(2026);
	const names = list.map((h) => h.name);

	it('has every date-holidays US holiday, with plain apostrophes and no substitute days', () => {
		const expected = new Set<string>();
		for (let year = 2026; year < 2034; year++)
			for (const h of new Holidays('US').getHolidays(year))
				if (!h.substitute) expected.add(h.name.replace(/’/g, "'"));
		expect(new Set(names)).toEqual(expected);
		expect(names).toContain("New Year's Day");
		expect(names).toContain('Juneteenth');
		expect(names).toContain('Election Day'); // only every 4 years (2028)
		expect(names.some((name) => /substitute|observed|’/.test(name))).toBe(false);
		expect(new Set(names).size).toBe(names.length);
	});

	it('gives public holidays no school and the others a regular day', () => {
		expect(findBuiltIn(list, 'Veterans Day')).toMatchObject({ type: 'public', school: 'none' });
		expect(findBuiltIn(list, 'Halloween')).toMatchObject({ type: 'observance', school: 'full' });
		expect(findBuiltIn(list, 'Christmas Eve')).toMatchObject({ type: 'optional', school: 'full' });
		expect(findBuiltIn(list, 'Valentine’s Day')?.name).toBe("Valentine's Day");
		expect(findBuiltIn(list, 'day after thanksgiving day')).toBeUndefined();
		expect(defaultSchool('bank')).toBe('full');
	});
});

describe('builtInDays: observed weekdays', () => {
	it('adds the observed Friday when Veterans Day is on a Saturday (Nov 2028)', () => {
		const days = builtInDays(2028).filter((d) => d.holiday === 'Veterans Day');
		expect(days.map((d) => [d.name, d.dateObj.getDate(), d.dateObj.getDay(), d.school])).toEqual([
			['Veterans Day (observed)', 10, 5, 'none'],
			['Veterans Day', 11, 6, 'none']
		]);
	});

	it("puts New Year's Day 2028's observed day on Fri Dec 31, 2027", () => {
		const observed = builtInDays(2027).find((d) => d.name === "New Year's Day (observed)");
		expect(observed?.dateObj).toEqual(new Date(2027, 11, 31));
		expect(observed?.holiday).toBe("New Year's Day");
	});
});

describe('observancesForMonth', () => {
	it('shows the built-in holidays with their school day when there are no records', () => {
		expect(lines(observancesForMonth([], 2026, 10))).toEqual([
			'11: Veterans Day [none]',
			'26: Thanksgiving Day [none]',
			'27: Day after Thanksgiving Day [full]'
		]);
	});

	it('shows "No School!" on the observed weekday (Nov 2028), with the holiday\'s settings', () => {
		expect(lines(observancesForMonth([], 2028, 10))).toEqual([
			'7: Election Day [full]',
			'10: Veterans Day (observed) [none]',
			'11: Veterans Day [none]',
			'23: Thanksgiving Day [none]',
			'24: Day after Thanksgiving Day [full]'
		]);
		const short = record({ name: 'Veterans Day', school: 'short', image: 'flag.png' });
		const friday = day(observancesForMonth([short], 2028, 10), 10)[0];
		expect(friday).toMatchObject({
			name: 'Veterans Day (observed)',
			school: 'short',
			observed: true
		});
		expect(friday.image).toBe(`${PB}/api/files/pbc_326962381/${short.id}/flag.png`);
		const hidden = record({ name: 'Veterans Day', hidden: true });
		expect(lines(observancesForMonth([hidden], 2028, 10))).not.toContain(
			'10: Veterans Day (observed) [none]'
		);
	});

	it('keeps "No School!" when a settings record has no school day (|| not ??)', () => {
		const notesOnly = record({ name: 'Veterans Day', description: 'Assembly', school: '' });
		expect(day(observancesForMonth([notesOnly], 2026, 10), 11)[0]).toMatchObject({
			school: 'none',
			description: 'Assembly'
		});
	});

	it('changes a built-in holiday with a settings record (typographic name too)', () => {
		const turkey = record({
			name: 'Thanksgiving Day',
			school: 'none',
			image: 'november.png',
			description: 'Turkey'
		});
		const half = record({ name: 'Day after Thanksgiving Day ', school: 'short' });
		const map = observancesForMonth([turkey, half], 2026, 10);
		expect(day(map, 26)[0]).toMatchObject({
			name: 'Thanksgiving Day',
			description: 'Turkey',
			image: `${PB}/api/files/pbc_326962381/${turkey.id}/november.png`,
			local: 'federal',
			holiday: 'Thanksgiving Day'
		});
		expect(day(map, 27)[0].school).toBe('short');
		const valentine = record({ name: 'Valentine’s Day', school: 'short' });
		expect(day(observancesForMonth([valentine], 2027, 1), 14)[0]).toMatchObject({
			name: "Valentine's Day",
			school: 'short'
		});
	});

	it('hides a built-in holiday whose settings say so, unless the record is off', () => {
		const hide = record({ name: 'Day after Thanksgiving Day', hidden: true });
		expect(day(observancesForMonth([hide], 2026, 10), 27)).toEqual([]);
		const off = record({ name: 'Day after Thanksgiving Day', hidden: true, is_active: false });
		expect(day(observancesForMonth([off], 2026, 10), 27)).toHaveLength(1);
	});

	it('ignores inactive records and settings for a name that is no built-in holiday', () => {
		const off = record({ name: 'Minimum Day', dates: ['2026-11-25'], is_active: false });
		const misspelled = record({ name: 'day after thanksgiving day', school: 'none' });
		expect(lines(observancesForMonth([off, misspelled], 2026, 10))).toEqual(
			lines(observancesForMonth([], 2026, 10))
		);
	});

	it("adds the class's own days: one-time, every year (MM-DD), and other rules", () => {
		const minimum = record({ name: 'Minimum Day', dates: ['2026-11-25'], school: 'short' });
		const yearly = record({ name: 'Book Fair', dates: ['11-19'] });
		const map = observancesForMonth([minimum, yearly], 2026, 10);
		expect(day(map, 25)[0]).toMatchObject({
			name: 'Minimum Day',
			school: 'short',
			local: 'local',
			recordId: minimum.id,
			image: ''
		});
		expect(day(map, 19)[0]).toMatchObject({ name: 'Book Fair', school: 'full' });
		// that year only / every year
		expect(day(observancesForMonth([minimum, yearly], 2027, 10), 25)).toHaveLength(1);
		expect(day(observancesForMonth([minimum, yearly], 2027, 10), 19)[0].name).toBe('Book Fair');
		// another date-holidays rule written in the dashboard still works
		const rule = record({ name: 'Teacher Day', dates: ['1st tuesday in May'] });
		expect(day(observancesForMonth([rule], 2027, 4), 4)[0].name).toBe('Teacher Day');
	});

	it('reads a dates string as one date, and skips what is not a date rule', () => {
		const text = record({ name: 'Picture Day', dates: '2026-11-18' as unknown as string[] });
		expect(day(observancesForMonth([text], 2026, 10), 18)[0].name).toBe('Picture Day');
		const odd = record({ name: 'Odd', dates: [42, null, 'nonsense'] as unknown as string[] });
		expect(() => observancesForMonth([odd], 2026, 10)).not.toThrow();
		expect(isSettingsRecord(odd)).toBe(false);
		expect(rawDates(record({ dates: null as unknown as string[] }))).toEqual([]);
	});

	it("puts built-in holidays first, then the class's own days, oldest record first", () => {
		const second = record({
			name: 'Second',
			dates: ['2026-11-26'],
			created: '2026-05-02 00:00:00.000Z'
		});
		const first = record({
			name: 'First',
			dates: ['2026-11-26'],
			created: '2026-05-01 00:00:00.000Z'
		});
		expect(day(observancesForMonth([second, first], 2026, 10), 26).map((h) => h.name)).toEqual([
			'Thanksgiving Day',
			'First',
			'Second'
		]);
	});

	it('shows its own picture, else its icon, else the default (picture order)', () => {
		const turkey = icon({});
		const withIcon = record({
			name: 'Feast',
			dates: ['2026-11-20'],
			icon: turkey.id,
			expand: { icon: turkey }
		});
		const both = record({
			name: 'Both',
			dates: ['2026-11-21'],
			image: 'own.png',
			icon: turkey.id,
			expand: { icon: turkey }
		});
		const map = observancesForMonth([withIcon, both], 2026, 10);
		expect(day(map, 20)[0].image).toBe(`${PB}/api/files/pbc_423132189/${turkey.id}/turkey_abc.png`);
		expect(day(map, 21)[0].image).toBe(`${PB}/api/files/pbc_326962381/${both.id}/own.png`);
		// an icon with no picture, or one that is gone: the default
		const bare = record({
			dates: ['2026-11-20'],
			icon: turkey.id,
			expand: { icon: icon({ image: '' }) }
		});
		expect(observancePicture(bare, icon({ image: '' }))).toBe('');
		const gone = record({ name: 'Gone', dates: ['2026-11-22'], icon: 'deletedicon0001' });
		expect(day(observancesForMonth([gone], 2026, 10), 22)[0].image).toBe('');
		// a built-in holiday's settings can use an icon too
		const settings = record({ name: 'Veterans Day', icon: turkey.id, expand: { icon: turkey } });
		expect(day(observancesForMonth([settings], 2026, 10), 11)[0].image).toContain('turkey_abc.png');
		// the editor passes its own (live) icons
		const newer = icon({ image: 'turkey_new.png' });
		expect(
			day(
				observancesForMonth([withIcon], 2026, 10, () => newer),
				20
			)[0].image
		).toContain('turkey_new.png');
	});

	it('adds up several settings records for one holiday, oldest first; the newest hidden counts', () => {
		const older = record({
			name: 'Veterans Day',
			image: 'old.png',
			school: 'short',
			created: '2026-01-01 00:00:00.000Z'
		});
		const newer = record({
			name: 'Veterans Day',
			description: 'Newer',
			created: '2026-02-01 00:00:00.000Z'
		});
		const settings = holidaySettings([newer, older]).get('Veterans Day');
		expect(settings).toMatchObject({ school: 'short', description: 'Newer', hidden: false });
		expect(settings?.image).toContain('old.png');
		const hideOld = record({ name: 'Tax Day', hidden: true, created: '2026-01-01 00:00:00.000Z' });
		const showNew = record({ name: 'Tax Day', hidden: false, created: '2026-03-01 00:00:00.000Z' });
		expect(day(observancesForMonth([hideOld, showNew], 2027, 3), 15)).toHaveLength(1);
	});
});
