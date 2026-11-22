import { describe, expect, it } from 'vitest';
import {
	addDays,
	addEntries,
	covers,
	dayDate,
	dayProblem,
	dayString,
	daysBetween,
	describeEntry,
	entryFromSaved,
	expandRange,
	formatMonthDay,
	isDayString,
	isYearlyString,
	MAX_RANGE_DAYS,
	nextYearly,
	savedDates,
	savedValue,
	setYearly,
	sortEntries,
	type DayEntry
} from './dates';

const once = (day: string): DayEntry => ({ kind: 'once', day });
const yearly = (day: string): DayEntry => ({ kind: 'yearly', day });
const TODAY = new Date(2026, 10, 22, 15, 30); // Sun Nov 22, 2026, afternoon

describe('local days', () => {
	it('reads and writes YYYY-MM-DD as the local day (not UTC midnight)', () => {
		const date = dayDate('2026-11-26');
		expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
			2026, 10, 26, 0
		]);
		expect(dayString(date)).toBe('2026-11-26');
		expect(dayString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
	});

	it('counts calendar days across daylight saving changes and month ends', () => {
		expect(dayString(addDays(dayDate('2026-03-07'), 1))).toBe('2026-03-08');
		expect(dayString(addDays(dayDate('2026-03-08'), 1))).toBe('2026-03-09');
		expect(dayString(addDays(dayDate('2026-10-31'), 1))).toBe('2026-11-01');
		expect(dayString(addDays(dayDate('2026-11-01'), 1))).toBe('2026-11-02');
		expect(dayString(addDays(dayDate('2026-12-31'), 1))).toBe('2027-01-01');
		expect(dayString(addDays(dayDate('2028-02-28'), 1))).toBe('2028-02-29');
		expect(daysBetween(dayDate('2026-03-01'), dayDate('2026-04-01'))).toBe(31);
		expect(daysBetween(dayDate('2026-10-25'), dayDate('2026-11-08'))).toBe(14);
		expect(daysBetween(new Date(2026, 10, 22, 23), new Date(2026, 10, 23, 1))).toBe(1);
	});
});

describe('strict validation', () => {
	it('accepts only real days in range', () => {
		expect(isDayString('2026-11-25')).toBe(true);
		expect(isDayString('2028-02-29')).toBe(true);
		for (const text of [
			'2026-02-29',
			'2026-02-30',
			'2026-11-31',
			'2026-13-01',
			'2026-00-10',
			'2026-11-00',
			'1999-12-31',
			'2100-01-01',
			'11/20/2026',
			'2026-11-25T00:00:00Z',
			'2026-1-5',
			' 2026-11-25',
			''
		])
			expect(isDayString(text), text).toBe(false);
	});

	it('accepts every-year days MM-DD, but not Feb 29', () => {
		expect(isYearlyString('11-19')).toBe(true);
		expect(isYearlyString('02-28')).toBe(true);
		expect(isYearlyString('12-31')).toBe(true);
		for (const text of ['02-29', '02-30', '04-31', '13-01', '00-01', '1-19', '11-19-2026'])
			expect(isYearlyString(text), text).toBe(false);
	});

	it('explains what is wrong with a picked day', () => {
		expect(dayProblem('')).toBe('Please choose a day.');
		expect(dayProblem('2026-02-30')).toMatch(/doesn't exist/);
		expect(dayProblem('0202-11-25')).toMatch(/between 2000 and 2099/);
		expect(dayProblem('20266-11-25')).toMatch(/date picker/);
		expect(dayProblem('2028-02-29')).toBe('');
		expect(dayProblem('2028-02-29', true)).toMatch(/Feb 29 can't repeat every year/);
	});
});

describe('saved entries', () => {
	it('reads one-time, yearly (next date from today) and other rules', () => {
		expect(entryFromSaved('2026-11-25', TODAY)).toEqual(once('2026-11-25'));
		expect(entryFromSaved('11-25', TODAY)).toEqual(yearly('2026-11-25'));
		expect(entryFromSaved('11-22', TODAY)).toEqual(yearly('2026-11-22')); // today counts
		expect(entryFromSaved('11-19', TODAY)).toEqual(yearly('2027-11-19'));
		expect(entryFromSaved('2026-02-30', TODAY)).toEqual({ kind: 'other', text: '2026-02-30' });
		expect(entryFromSaved('02-29', TODAY)).toEqual({ kind: 'other', text: '02-29' });
		expect(entryFromSaved('2026-12-21 P5D', TODAY).kind).toBe('other');
		expect(entryFromSaved(42, TODAY)).toEqual({ kind: 'other', text: '42' });
	});

	it('saves one-time days, then yearly ones, then the rest, without duplicates', () => {
		const entries = [
			yearly('2027-01-05'),
			once('2026-12-01'),
			{ kind: 'other', text: 'easter 49' } as DayEntry,
			once('2026-11-25'),
			yearly('2026-11-30'),
			once('2026-11-25')
		];
		expect(savedDates(entries)).toEqual([
			'2026-11-25',
			'2026-12-01',
			'01-05',
			'11-30',
			'easter 49'
		]);
		expect(savedValue(yearly('2027-01-05'))).toBe('01-05');
		expect(sortEntries(entries).map(savedValue)).toEqual([
			'2026-11-25',
			'2026-11-25',
			'11-30',
			'2026-12-01',
			'01-05',
			'easter 49'
		]);
	});

	it('next yearly day rolls over at the end of the year', () => {
		expect(nextYearly('01-01', new Date(2026, 11, 31))).toBe('2027-01-01');
		expect(nextYearly('12-31', new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
	});
});

describe('adding days without duplicates', () => {
	it('skips days already there or covered by a yearly day', () => {
		const start = [once('2026-11-25'), yearly('2026-12-24')];
		const result = addEntries(start, [once('2026-11-25'), once('2027-12-24'), once('2026-11-26')]);
		expect(result.added).toBe(1);
		expect(result.alreadyThere.map(savedValue)).toEqual(['2026-11-25', '2027-12-24']);
		expect(result.entries.map(savedValue)).toEqual(['2026-11-25', '2026-11-26', '12-24']);
	});

	it('a yearly day replaces the one-time days it covers', () => {
		const result = addEntries(
			[once('2026-11-19'), once('2027-11-19'), once('2026-11-20')],
			[yearly('2026-11-19')]
		);
		expect(result.replaced.map(savedValue)).toEqual(['2026-11-19', '2027-11-19']);
		expect(savedDates(result.entries)).toEqual(['2026-11-20', '11-19']);
		expect(covers(yearly('2026-11-19'), once('2030-11-19'))).toBe(true);
		expect(covers(once('2026-11-19'), yearly('2026-11-19'))).toBe(false);
	});

	it('switches every year on and off, merging duplicates; Feb 29 refused', () => {
		const list = [once('2026-11-19'), yearly('2027-11-19'), once('2028-02-29')];
		const off = setYearly(list, 1, false);
		expect('entries' in off && savedDates(off.entries)).toEqual([
			'2026-11-19',
			'2027-11-19',
			'2028-02-29'
		]);
		const on = setYearly(list, 0, true);
		expect('entries' in on && savedDates(on.entries)).toEqual(['2028-02-29', '11-19']);
		const leap = setYearly(list, 2, true);
		expect('error' in leap && leap.error).toMatch(/Feb 29/);
	});
});

describe('ranges', () => {
	it('expands to single days, both ends included', () => {
		expect(expandRange('2026-12-21', '2026-12-23')).toEqual({
			days: ['2026-12-21', '2026-12-22', '2026-12-23'],
			skippedWeekends: 0
		});
	});

	it('skips weekends when asked, across months, years and daylight saving', () => {
		const winter = expandRange('2026-12-21', '2027-01-01', { skipWeekends: true });
		expect(winter).toEqual({
			days: [
				'2026-12-21',
				'2026-12-22',
				'2026-12-23',
				'2026-12-24',
				'2026-12-25',
				'2026-12-28',
				'2026-12-29',
				'2026-12-30',
				'2026-12-31',
				'2027-01-01'
			],
			skippedWeekends: 2
		});
		const spring = expandRange('2026-03-06', '2026-03-10', { skipWeekends: true });
		expect(spring).toEqual({
			days: ['2026-03-06', '2026-03-09', '2026-03-10'],
			skippedWeekends: 2
		});
		const fall = expandRange('2026-10-30', '2026-11-03');
		expect('days' in fall && fall.days).toEqual([
			'2026-10-30',
			'2026-10-31',
			'2026-11-01',
			'2026-11-02',
			'2026-11-03'
		]);
	});

	it('refuses backwards, too long, all-weekend and yearly Feb 29 ranges', () => {
		expect(expandRange('2026-12-23', '2026-12-21')).toEqual({
			error: 'The last day must be on or after the first day.'
		});
		const long = expandRange('2026-01-01', '2026-12-31');
		expect('error' in long && long.error).toMatch(`up to ${MAX_RANGE_DAYS} days`);
		expect(expandRange('2026-11-28', '2026-11-29', { skipWeekends: true })).toEqual({
			error: 'Those days are all on a weekend.'
		});
		const leap = expandRange('2028-02-27', '2028-03-01', { yearly: true });
		expect('error' in leap && leap.error).toMatch(/Feb 29/);
		expect(expandRange('', '2026-11-01')).toEqual({ error: 'First day: Please choose a day.' });
		expect(expandRange('2026-11-01', '2026-11-31')).toMatchObject({ error: /^Last day:/ });
	});
});

describe('wording', () => {
	it('names days the way the form lists them', () => {
		expect(describeEntry(once('2026-11-25'))).toBe('Wed, Nov 25, 2026');
		expect(describeEntry(yearly('2027-11-19'))).toBe('Every year on Nov 19');
		expect(formatMonthDay('02-29')).toBe('Feb 29');
		expect(describeEntry({ kind: 'other', text: 'easter 49' })).toBe('easter 49');
	});
});
