import { describe, it, expect } from 'vitest';
import { PUBLIC_POCKETBASE_URL } from '$app/env/public';
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
import type { BirthdayPerson } from '#lib/birthdays.ts';
import type { CalendarObservance, IconRecord } from './types';

// the same PocketBase address the code builds picture URLs with (vite.config.ts gives the tests a
// default; a PUBLIC_POCKETBASE_URL in the environment wins)
const PB = PUBLIC_POCKETBASE_URL;

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

	it('hides a built-in holiday whose settings say so, even with "Use these changes" off', () => {
		const hide = record({ name: 'Day after Thanksgiving Day', hidden: true });
		expect(day(observancesForMonth([hide], 2026, 10), 27)).toEqual([]);
		// off: its picture, school day and notes don't count, but Hide still does
		const off = record({
			name: 'Day after Thanksgiving Day',
			hidden: true,
			is_active: false,
			school: 'none'
		});
		expect(day(observancesForMonth([off], 2026, 10), 27)).toEqual([]);
		const shown = record({
			name: 'Veterans Day',
			hidden: false,
			is_active: false,
			school: 'short'
		});
		expect(day(observancesForMonth([shown], 2026, 10), 11)[0]).toMatchObject({ school: 'none' });
		// a newer record that is off and not hidden doesn't show it again; one that is on does
		const older = record({ name: 'Tax Day', hidden: true });
		const newerOff = record({ name: 'Tax Day', is_active: false });
		expect(day(observancesForMonth([older, newerOff], 2026, 3), 15)).toEqual([]);
		const newerOn = record({ name: 'Tax Day' });
		expect(day(observancesForMonth([older, newerOn], 2026, 3), 15)).toHaveLength(1);
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

describe('another name for a built-in holiday (display_name)', () => {
	it('shows it instead of the built-in name; `holiday` stays the built-in one', () => {
		const turkey = record({ name: 'Thanksgiving Day', display_name: ' Turkey Day ' });
		const map = observancesForMonth([turkey], 2026, 10);
		expect(day(map, 26)[0]).toMatchObject({
			name: 'Turkey Day',
			holiday: 'Thanksgiving Day',
			local: 'federal',
			school: 'none'
		});
		// the other holidays keep their names
		expect(day(map, 27)[0].name).toBe('Day after Thanksgiving Day');
		expect(holidaySettings([turkey]).get('Thanksgiving Day')?.displayName).toBe('Turkey Day');
	});

	it('adds " (observed)" on the weekday off (Veterans Day 2028 is on a Saturday)', () => {
		const vets = record({ name: 'Veterans Day', display_name: 'Thank a Veteran Day' });
		const map = observancesForMonth([vets], 2028, 10);
		expect(day(map, 10)[0]).toMatchObject({
			name: 'Thank a Veteran Day (observed)',
			holiday: 'Veterans Day',
			observed: true
		});
		expect(day(map, 11)[0].name).toBe('Thank a Veteran Day');
	});

	it('is only used while "Use these changes" is on; the empty name leaves the built-in one', () => {
		const off = record({ name: 'Thanksgiving Day', display_name: 'Turkey Day', is_active: false });
		expect(day(observancesForMonth([off], 2026, 10), 26)[0].name).toBe('Thanksgiving Day');
		expect(holidaySettings([off]).get('Thanksgiving Day')?.displayName).toBe('');
		const blank = record({ name: 'Thanksgiving Day', display_name: '   ' });
		expect(day(observancesForMonth([blank], 2026, 10), 26)[0].name).toBe('Thanksgiving Day');
		// a record that never had the field (PocketBase before the migration)
		const old = record({ name: 'Thanksgiving Day', school: 'short' });
		delete old.display_name;
		expect(day(observancesForMonth([old], 2026, 10), 26)[0]).toMatchObject({
			name: 'Thanksgiving Day',
			school: 'short'
		});
	});

	it('adds up several records oldest first: an empty name leaves the older one alone', () => {
		const older = record({
			name: 'Thanksgiving Day',
			display_name: 'Turkey Day',
			created: '2026-01-01 00:00:00.000Z'
		});
		const newer = record({
			name: 'Thanksgiving Day',
			school: 'short',
			created: '2026-02-01 00:00:00.000Z'
		});
		expect(day(observancesForMonth([newer, older], 2026, 10), 26)[0]).toMatchObject({
			name: 'Turkey Day',
			school: 'short'
		});
		const newest = record({
			name: 'Thanksgiving Day',
			display_name: 'Feast Day',
			created: '2026-03-01 00:00:00.000Z'
		});
		expect(day(observancesForMonth([newest, newer, older], 2026, 10), 26)[0].name).toBe(
			'Feast Day'
		);
	});

	it('is not used by a hidden holiday, nor by your own days', () => {
		const hidden = record({ name: 'Thanksgiving Day', display_name: 'Turkey Day', hidden: true });
		expect(day(observancesForMonth([hidden], 2026, 10), 26)).toEqual([]);
		const own = record({ name: 'Fair', dates: ['2026-11-19'], display_name: 'Other' });
		expect(day(observancesForMonth([own], 2026, 10), 19)[0].name).toBe('Fair');
	});
});

describe('birthdays on the month page', () => {
	const person = (fields: Partial<BirthdayPerson>): BirthdayPerson => ({
		id: 'per000000000001',
		collectionId: 'pbc_1795321340',
		name: 'Bluey',
		title: '',
		avatar: '',
		active: true,
		birthday: '11-26',
		...fields
	});

	it('come after the built-in holidays and your own days of the same day', () => {
		const feast = record({ name: 'Class Feast', dates: ['2026-11-26'] });
		const map = observancesForMonth([feast], 2026, 10, undefined, [person({})]);
		expect(day(map, 26).map((h) => [h.name, h.local])).toEqual([
			['Thanksgiving Day', 'federal'],
			['Class Feast', 'local'],
			["Bluey's Birthday", 'birthday']
		]);
		// a birthday alone on its day, and none for people switched off
		const map2 = observancesForMonth([], 2026, 10, undefined, [
			person({ id: 'per000000000002', name: 'Bingo', birthday: '11-03' }),
			person({ id: 'per000000000003', name: 'Muffin', birthday: '11-04', active: false })
		]);
		expect(day(map2, 3).map((h) => h.name)).toEqual(["Bingo's Birthday"]);
		expect(day(map2, 4)).toEqual([]);
	});

	it('are left out when no people are passed (the editor and Home use it so)', () => {
		expect(lines(observancesForMonth([], 2026, 10))).toEqual([
			'11: Veterans Day [none]',
			'26: Thanksgiving Day [none]',
			'27: Day after Thanksgiving Day [full]'
		]);
	});

	it("don't change the day's school badge", () => {
		const map = observancesForMonth([], 2026, 10, undefined, [person({ birthday: '11-27' })]);
		expect(day(map, 27).map((h) => h.school)).toEqual(['full', 'full']);
	});
});
