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
	entryCheck,
	entryFromSaved,
	entryNext,
	entryRule,
	expandRange,
	formatMonthDay,
	isDayString,
	isYearlyString,
	keyOf,
	MAX_RANGE_DAYS,
	nextYearly,
	ruleEntry,
	savedDates,
	savedValue,
	setYearly,
	sortEntries,
	spacesFix,
	yearlyEntry,
	type DayEntry
} from './dates';

const once = (day: string): DayEntry => ({ kind: 'once', day });
const yearly = (day: string): DayEntry => ({ kind: 'yearly', day });
const rule = (text: string): DayEntry => ({ kind: 'rule', rule: text });
const other = (text: string): DayEntry => ({ kind: 'other', text, value: text });
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
		expect(entryFromSaved('2026-02-30', TODAY)).toEqual(other('2026-02-30'));
		expect(entryFromSaved('02-29', TODAY)).toEqual(other('02-29'));
		expect(entryFromSaved('2026-12-21 P5D', TODAY).kind).toBe('other');
		expect(entryFromSaved(42, TODAY)).toEqual({ kind: 'other', text: '42', value: 42 });
	});

	it('reads the rules the Days editor builds as rules, saved exactly as they were written', () => {
		for (const text of [
			'easter 49',
			'3rd Monday in January',
			'3rd monday in January',
			'Monday before 06-01',
			'15 Nisan',
			'chinese 01-0-01',
			'07-04 if Saturday then previous Friday if Sunday then next Monday'
		])
			expect(entryFromSaved(text, TODAY), text).toEqual(rule(text));
		// Not built by the editor: kept as written (they still work, see entryCheck).
		for (const text of ['easter +1', '5th Friday in May', '03-02 in even years', '12-21 P10D'])
			expect(entryFromSaved(text, TODAY).kind, text).toBe('other');
	});

	it('saves entries written in the dashboard back exactly as they were', () => {
		const rule = { a: 1 };
		const saved = [42, rule, '03-02 in even years', null, true, '2026-11-25'];
		const entries = saved.map((value) => entryFromSaved(value, TODAY));
		expect(entries.map((entry) => entry.kind === 'other' && entry.text)).toEqual([
			'42',
			'{"a":1}',
			'03-02 in even years',
			'null',
			'true',
			false
		]);
		const again = savedDates(entries);
		expect(again).toEqual(['2026-11-25', 42, { a: 1 }, '03-02 in even years', null, true]);
		expect(again[2]).toBe(rule);
		// A number and the same number as text are two different entries.
		expect(savedDates([entryFromSaved(42, TODAY), entryFromSaved('42', TODAY)])).toEqual([
			42,
			'42'
		]);
	});

	it('saves one-time days, then yearly ones, then rules as added, then the rest, without duplicates', () => {
		const entries = [
			yearly('2027-01-05'),
			rule('orthodox'),
			once('2026-12-01'),
			other('easter 49 in even years'),
			once('2026-11-25'),
			rule('easter -2'),
			yearly('2026-11-30'),
			once('2026-11-25'),
			rule('orthodox')
		];
		expect(savedDates(entries)).toEqual([
			'2026-11-25',
			'2026-12-01',
			'01-05',
			'11-30',
			'orthodox',
			'easter -2',
			'easter 49 in even years'
		]);
		expect(savedValue(yearly('2027-01-05'))).toBe('01-05');
		expect(savedValue(rule('easter -2'))).toBe('easter -2');
		expect(sortEntries(entries).map(savedValue)).toEqual([
			'2026-11-25',
			'2026-11-25',
			'11-30',
			'2026-12-01',
			'01-05',
			'orthodox',
			'easter -2',
			'orthodox',
			'easter 49 in even years'
		]);
		// The same entries in another order save the same list (so nothing looks changed).
		expect(savedDates([...entries].reverse().filter((e) => e.kind !== 'rule'))).toEqual(
			savedDates(entries.filter((e) => e.kind !== 'rule'))
		);
	});

	it("knows each entry's next day, worked out like the slide", () => {
		expect(entryNext(once('2026-11-25'), TODAY)).toEqual(new Date(2026, 10, 25));
		expect(entryNext(once('2026-11-21'), TODAY)).toBeNull();
		expect(entryNext(once('2026-11-22'), TODAY)).toEqual(new Date(2026, 10, 22));
		expect(entryNext(yearly('2027-11-19'), TODAY)).toEqual(new Date(2027, 10, 19));
		expect(entryNext(rule('3rd Monday in January'), TODAY)).toEqual(new Date(2027, 0, 18));
		expect(entryNext(other('03-02 in even years'), TODAY)).toEqual(new Date(2028, 2, 2));
		expect(entryNext(other('nonsense'), TODAY)).toBeNull();
		expect(entryNext({ kind: 'other', text: '42', value: 42 }, TODAY)).toBeNull();
		// Written in the dashboard: it starts years from now, or has passed.
		expect(entryNext(other('11-20 since 2040'), TODAY)).toEqual(new Date(2040, 10, 20));
		expect(entryNext(other('11-20 prior to 2020'), TODAY)).toBeNull();
		expect(entryCheck(once('2026-11-25'), TODAY)).toBeNull();
		expect(entryCheck({ kind: 'other', text: '42', value: 42 }, TODAY)).toEqual({
			readable: false,
			days: [],
			long: false
		});
		expect(entryCheck(other('12-21 P10D'), TODAY)).toMatchObject({ readable: true, long: true });
		expect(entryRule(other('easter 49 in even years'))).toBe('easter 49 in even years');
		expect(entryRule({ kind: 'other', text: 'null', value: null })).toBeNull();
	});

	it('counts a rule and the same text saved in the dashboard as the same day', () => {
		expect(keyOf(rule('easter -2'))).toBe(keyOf(other('easter -2')));
		expect(keyOf({ kind: 'other', text: '42', value: 42 })).not.toBe(keyOf(other('42')));
		expect(keyOf(once('2026-11-19'))).not.toBe(keyOf(yearly('2026-11-19')));
		const result = addEntries([other('easter -2')], [rule('easter -2'), rule('easter -3')]);
		expect(result.added).toBe(1);
		expect(result.alreadyThere).toEqual([rule('easter -2')]);
		expect(savedDates(result.entries)).toEqual(['easter -3', 'easter -2']);
	});

	it("counts a rule the editor builds as the same day however its weekdays' first letter is written", () => {
		// date-holidays reads both; its own data writes 'monday'.
		const lower = entryFromSaved(
			'07-04 if saturday then previous friday if sunday then next monday',
			TODAY
		);
		expect(lower.kind).toBe('rule');
		expect(keyOf(lower)).toBe(
			keyOf(rule('07-04 if Saturday then previous Friday if Sunday then next Monday'))
		);
		expect(keyOf(rule('3rd monday in January'))).toBe(keyOf(rule('3rd Monday in January')));
		const result = addEntries([rule('3rd Monday in January')], [rule('3rd monday in January')]);
		expect(result.added).toBe(0);
		expect(
			covers(lower, rule('07-04 if Saturday then previous Friday if Sunday then next Monday'))
		).toBe(true);
		// Saved back as it was written.
		expect(savedDates([lower])).toEqual([
			'07-04 if saturday then previous friday if sunday then next monday'
		]);
		// Rules the editor doesn't build are compared as written.
		expect(keyOf(rule('easter -2'))).not.toBe(keyOf(rule('easter  -2')));
		expect(keyOf(rule('3rd monday in january'))).not.toBe(keyOf(rule('3rd Monday in January')));
	});

	it('knows a rule the calendar can only read with single spaces (Edit, then Save change, fixes it)', () => {
		expect(spacesFix(other('easter  -2'), TODAY)).toBe(true);
		expect(spacesFix(other('3rd Monday  in January'), TODAY)).toBe(true);
		expect(entryCheck(other('easter  -2'), TODAY)?.readable).toBe(false);
		// Readable as it is, unreadable either way, or not text: nothing to fix.
		expect(spacesFix(other('easter -2'), TODAY)).toBe(false);
		expect(spacesFix(other('non  sense'), TODAY)).toBe(false);
		expect(spacesFix({ kind: 'other', text: '42', value: 42 }, TODAY)).toBe(false);
		expect(spacesFix(once('2026-11-25'), TODAY)).toBe(false);
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
		const off = setYearly(list, 1, false, TODAY);
		expect('entries' in off && savedDates(off.entries)).toEqual([
			'2026-11-19',
			'2027-11-19',
			'2028-02-29'
		]);
		const on = setYearly(list, 0, true, TODAY);
		expect('entries' in on && savedDates(on.entries)).toEqual(['2028-02-29', '11-19']);
		const leap = setYearly(list, 2, true, TODAY);
		expect('error' in leap && leap.error).toMatch(/Feb 29/);
	});

	it('shows a yearly day with its next date, also when the date picked has passed', () => {
		// TODAY is Sun, Nov 22, 2026.
		expect(yearlyEntry('2026-03-04', TODAY)).toEqual(yearly('2027-03-04'));
		expect(yearlyEntry('2026-11-22', TODAY)).toEqual(yearly('2026-11-22')); // today counts
		expect(yearlyEntry('2030-12-25', TODAY)).toEqual(yearly('2026-12-25'));
		// The same when "every year" is ticked on a one-time day that has passed.
		const on = setYearly([once('2025-03-04'), once('2026-12-01')], 0, true, TODAY);
		expect('entries' in on && on.entries).toEqual([once('2026-12-01'), yearly('2027-03-04')]);
		// Unticked again, it keeps the date it showed.
		const off = 'entries' in on ? setYearly(on.entries, 1, false, TODAY) : on;
		expect('entries' in off && off.entries).toEqual([once('2026-12-01'), once('2027-03-04')]);
	});

	it('leaves rules alone when "every year" is switched', () => {
		const list = [rule('easter -2'), other('03-02 in even years')];
		expect(setYearly(list, 0, false, TODAY)).toEqual({ entries: list });
		expect(setYearly(list, 1, true, TODAY)).toEqual({ entries: list });
	});
});

describe('rules typed or built in the Days editor', () => {
	const entryOf = (text: string) => {
		const result = ruleEntry(text, TODAY);
		return 'entry' in result ? result.entry : result.error;
	};

	it('adds a rule with single spaces', () => {
		expect(entryOf('  3rd Monday   in January ')).toEqual(rule('3rd Monday in January'));
		expect(entryOf('03-02 in even years')).toEqual(rule('03-02 in even years'));
		expect(entryOf('Friday after 4th Thursday in November')).toEqual(
			rule('Friday after 4th Thursday in November')
		);
	});

	it('makes a plain date a one-time or yearly day, with the date picker checks', () => {
		expect(entryOf('2026-11-25')).toEqual(once('2026-11-25'));
		expect(entryOf('11-25')).toEqual(yearly('2026-11-25'));
		expect(entryOf('3-4')).toEqual(yearly('2027-03-04'));
		expect(entryOf('2028-2-29')).toEqual(once('2028-02-29'));
		expect(entryOf('02-29')).toMatch(/Feb 29 can't repeat every year/);
		expect(entryOf('2026-02-30')).toMatch(/doesn't exist/);
		expect(entryOf('02-30')).toMatch(/doesn't exist/);
		expect(entryOf('1999-05-01')).toMatch(/between 2000 and 2099/);
	});

	it('refuses what the calendar would get wrong or never show', () => {
		expect(entryOf('')).toBe('Please type a rule.');
		expect(entryOf('12-21 P10D')).toMatch(/^For several days in a row, use a range instead/);
		expect(entryOf('last Monday in May')).toMatch(/can't read this rule/);
		expect(entryOf('since 2027')).toMatch(/can't read this rule/);
		expect(entryOf('02-29 if Sunday then next Monday')).toMatch(/Feb 29 can't repeat/);
		expect(entryOf('Monday before 02-30')).toMatch(/02-30 isn't a real date/);
		expect(entryOf('11-20 prior to 2020')).toMatch(/doesn't happen in the next 10 years/);
	});

	it('describes rules in words where the editor built them', () => {
		expect(describeEntry(rule('3rd Monday in January'))).toBe(
			'Every year on the 3rd Monday in January'
		);
		expect(describeEntry(rule('easter -2'))).toBe('Every year 2 days before Easter Sunday');
		expect(describeEntry(rule('1 Shawwal'))).toBe('Every year on 1 Shawwal (Islamic calendar)');
		expect(describeEntry(rule('03-02 in even years'))).toBe('03-02 in even years');
		expect(describeEntry(other('03-02 in even years'))).toBe('03-02 in even years');
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
		expect(describeEntry(other('easter 49'))).toBe('easter 49');
	});
});
