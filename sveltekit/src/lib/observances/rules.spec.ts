import Holidays from 'date-holidays';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { builtInHolidays, findBuiltIn, observancesForMonth } from '#lib/pb/calendar.ts';
import type { CalendarObservance } from '#lib/pb/types.ts';
import {
	CALENDAR_IDS,
	CALENDARS,
	checkRule,
	dayThirtyNote,
	describeRule,
	FEB_29_YEARLY,
	MONTHS,
	NTHS,
	ordinal,
	parseRule,
	QUICK_PICKS,
	RULE_YEARS,
	ruleHolidays,
	ruleProblem,
	ruleText,
	tidyRule,
	USE_A_RANGE,
	WEEKDAYS,
	type RuleSpec,
	type WeekendMove
} from './rules';

const TODAY = new Date(2026, 10, 22, 15, 30); // Sun Nov 22, 2026, afternoon
const FROM = '2026-11-22';
const UNTIL = '2036-11-22';

afterEach(() => {
	vi.restoreAllMocks();
});

// --- Reference calculations (plain JavaScript, local days) -------------------------------------

const pad = (value: number, length = 2) => String(value).padStart(length, '0');
const key = (date: Date) =>
	`${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const day = (year: number, month: number, date: number) => new Date(year, month - 1, date);
const plus = (date: Date, days: number) =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** The nth (1-4) weekday of a month, or the last one. */
function nthWeekday(year: number, month: number, weekday: number, nth: number | 'last'): Date {
	if (nth === 'last') {
		const last = day(year, month + 1, 0);
		return plus(last, -((last.getDay() - weekday + 7) % 7));
	}
	const first = day(year, month, 1);
	return plus(first, ((weekday - first.getDay() + 7) % 7) + (nth - 1) * 7);
}

/** The first `weekday` after (or the last before) a day, never the day itself. */
function nextWeekday(date: Date, weekday: number, direction: 'before' | 'after'): Date {
	if (direction === 'after') return plus(date, (weekday - date.getDay() + 7) % 7 || 7);
	return plus(date, -((date.getDay() - weekday + 7) % 7 || 7));
}

/** Western Easter Sunday (the anonymous Gregorian algorithm). */
function westernEaster(year: number): Date {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const n = h + l - 7 * m + 114;
	return day(year, Math.floor(n / 31), (n % 31) + 1);
}

/** Orthodox Easter (Meeus' Julian algorithm, +13 days to the Gregorian calendar in 1900-2099). */
function orthodoxEaster(year: number): Date {
	const d = (19 * (year % 19) + 15) % 30;
	const e = (2 * (year % 4) + 4 * (year % 7) - d + 34) % 7;
	const n = d + e + 114;
	return plus(day(year, Math.floor(n / 31), (n % 31) + 1), 13);
}

/** The days of `each(year)` for the years the editor looks at, inside its window. */
function expected(each: (year: number) => Date | Date[]): string[] {
	const days = new Set<string>();
	for (let year = 2025; year <= 2037; year++)
		for (const date of [each(year)].flat()) {
			const text = key(date);
			if (text >= FROM && text < UNTIL) days.add(text);
		}
	return [...days].sort();
}

const daysOf = (spec: RuleSpec) => checkRule(ruleText(spec), TODAY).days;

// --- Building and reading rules ----------------------------------------------------------------

describe('a weekday of a month', () => {
	it('builds and reads back every choice, and gives the right day for 10 years', () => {
		for (const nth of NTHS)
			for (let weekday = 0; weekday < 7; weekday++)
				for (let month = 1; month <= 12; month++) {
					const spec: RuleSpec = { kind: 'weekday', nth, weekday, month };
					const text = ruleText(spec);
					expect(parseRule(text), text).toEqual(spec);
					expect(daysOf(spec), text).toEqual(
						expected((year) => nthWeekday(year, month, weekday, nth))
					);
				}
	});

	it('writes the rules date-holidays reads ("last" as the weekday before the next 1st)', () => {
		const text = (nth: RuleSpec & { kind: 'weekday' }) => ruleText(nth);
		expect(text({ kind: 'weekday', nth: 3, weekday: 1, month: 1 })).toBe('3rd Monday in January');
		expect(text({ kind: 'weekday', nth: 'last', weekday: 1, month: 5 })).toBe(
			'Monday before 06-01'
		);
		expect(text({ kind: 'weekday', nth: 'last', weekday: 1, month: 2 })).toBe(
			'Monday before 03-01'
		);
		// "after" counts the day itself: Dec 25-31 holds exactly one of each weekday.
		expect(text({ kind: 'weekday', nth: 'last', weekday: 5, month: 12 })).toBe(
			'Friday after 12-25'
		);
		expect(
			text({
				kind: 'weekday',
				nth: 4,
				weekday: 4,
				month: 11,
				then: { direction: 'after', weekday: 5 }
			})
		).toBe('Friday after 4th Thursday in November');
	});

	it('gets the last weekday of December right when Dec 24 is that weekday (2027: Fri Dec 31)', () => {
		const lastFriday: RuleSpec = { kind: 'weekday', nth: 'last', weekday: 5, month: 12 };
		expect(daysOf(lastFriday).slice(0, 3)).toEqual(['2026-12-25', '2027-12-31', '2028-12-29']);
		// 'Friday after 12-24' would give Dec 24, 2027.
		expect(checkRule('Friday after 12-24', TODAY).days[1]).toBe('2027-12-24');
	});

	it('gets the last weekday of February right in leap years', () => {
		const lastMonday: RuleSpec = { kind: 'weekday', nth: 'last', weekday: 1, month: 2 };
		expect(daysOf(lastMonday).slice(0, 3)).toEqual(['2027-02-22', '2028-02-28', '2029-02-26']);
		const lastTuesday: RuleSpec = { kind: 'weekday', nth: 'last', weekday: 2, month: 2 };
		expect(daysOf(lastTuesday)[1]).toBe('2028-02-29');
	});

	it('then the weekday before or after it, also into the next month or year', () => {
		for (const nth of NTHS)
			for (const month of [1, 5, 9, 11, 12])
				for (const direction of ['before', 'after'] as const)
					for (const [weekday, then] of [
						[4, 5],
						[1, 0],
						[0, 6],
						[3, 2]
					]) {
						const spec: RuleSpec = {
							kind: 'weekday',
							nth,
							weekday,
							month,
							then: { direction, weekday: then }
						};
						const text = ruleText(spec);
						expect(parseRule(text), text).toEqual(spec);
						expect(daysOf(spec), text).toEqual(
							expected((year) =>
								nextWeekday(nthWeekday(year, month, weekday, nth), then, direction)
							)
						);
					}
	});

	it("Grandparents' Day: the Sunday after Labor Day", () => {
		const spec = parseRule('Sunday after 1st Monday in September');
		expect(spec).toEqual({
			kind: 'weekday',
			nth: 1,
			weekday: 1,
			month: 9,
			then: { direction: 'after', weekday: 0 }
		});
		expect(describeRule(spec!)).toBe('Every year on the Sunday after the 1st Monday in September');
	});

	it('describes it', () => {
		expect(describeRule({ kind: 'weekday', nth: 3, weekday: 1, month: 1 })).toBe(
			'Every year on the 3rd Monday in January'
		);
		expect(describeRule({ kind: 'weekday', nth: 'last', weekday: 1, month: 5 })).toBe(
			'Every year on the last Monday in May'
		);
		expect(
			describeRule({
				kind: 'weekday',
				nth: 4,
				weekday: 4,
				month: 11,
				then: { direction: 'before', weekday: 3 }
			})
		).toBe('Every year on the Wednesday before the 4th Thursday in November');
	});
});

describe('every year on a date, moved off a weekend', () => {
	const moves: Record<Exclude<WeekendMove, 'keep'>, [saturday: number, sunday: number]> = {
		nearest: [-1, 1],
		monday: [2, 1],
		friday: [-1, -2]
	};

	it('builds and reads back the rule, and moves only Saturdays and Sundays', () => {
		const dates = [
			[1, 1],
			[2, 28],
			[3, 1],
			[7, 4],
			[11, 11],
			[12, 25],
			[12, 31]
		];
		for (const [weekend, [saturday, sunday]] of Object.entries(moves))
			for (const [month, date] of dates) {
				const spec = { kind: 'date', month, day: date, weekend } as RuleSpec;
				const text = ruleText(spec);
				expect(parseRule(text), text).toEqual(spec);
				expect(daysOf(spec), text).toEqual(
					expected((year) => {
						const on = day(year, month, date);
						const shift = on.getDay() === 6 ? saturday : on.getDay() === 0 ? sunday : 0;
						return plus(on, shift);
					})
				);
			}
	});

	it('writes the rules date-holidays reads', () => {
		expect(ruleText({ kind: 'date', month: 7, day: 4, weekend: 'nearest' })).toBe(
			'07-04 if Saturday then previous Friday if Sunday then next Monday'
		);
		expect(ruleText({ kind: 'date', month: 7, day: 4, weekend: 'monday' })).toBe(
			'07-04 if Saturday,Sunday then next Monday'
		);
		expect(ruleText({ kind: 'date', month: 7, day: 4, weekend: 'friday' })).toBe(
			'07-04 if Saturday,Sunday then previous Friday'
		);
		// Jul 4, 2027 is a Sunday, 2026's a Saturday.
		expect(checkRule('07-04 if Saturday,Sunday then next Monday', TODAY).days.slice(0, 2)).toEqual([
			'2027-07-05',
			'2028-07-04'
		]);
	});

	it('moves Sun Dec 31, 2028 to Mon Jan 1, 2029', () => {
		const days = daysOf({ kind: 'date', month: 12, day: 31, weekend: 'nearest' });
		expect(days).toContain('2029-01-01');
		expect(days).not.toContain('2028-12-31');
	});

	it('describes it', () => {
		expect(describeRule({ kind: 'date', month: 7, day: 4, weekend: 'nearest' })).toBe(
			'Every year on Jul 4 (on a weekend: the nearest weekday)'
		);
		expect(describeRule({ kind: 'date', month: 12, day: 25, weekend: 'monday' })).toBe(
			'Every year on Dec 25 (on a weekend: the Monday after)'
		);
		expect(describeRule({ kind: 'date', month: 1, day: 1, weekend: 'friday' })).toBe(
			'Every year on Jan 1 (on a weekend: the Friday before)'
		);
	});
});

describe('counted from Easter', () => {
	it('builds and reads back the rule, and gives the right day for 10 years', () => {
		for (const easter of ['easter', 'orthodox'] as const)
			for (const offset of [-99, -47, -46, -7, -2, -1, 0, 1, 39, 49, 50, 60, 99]) {
				const spec: RuleSpec = { kind: 'easter', easter, offset };
				const text = ruleText(spec);
				expect(parseRule(text), text).toEqual(spec);
				const sunday = easter === 'easter' ? westernEaster : orthodoxEaster;
				expect(daysOf(spec), text).toEqual(expected((year) => plus(sunday(year), offset)));
			}
	});

	it('writes and describes it', () => {
		expect(ruleText({ kind: 'easter', easter: 'easter', offset: 0 })).toBe('easter');
		expect(ruleText({ kind: 'easter', easter: 'easter', offset: -2 })).toBe('easter -2');
		expect(ruleText({ kind: 'easter', easter: 'orthodox', offset: 1 })).toBe('orthodox 1');
		expect(describeRule({ kind: 'easter', easter: 'easter', offset: -2 })).toBe(
			'Every year 2 days before Easter Sunday'
		);
		expect(describeRule({ kind: 'easter', easter: 'easter', offset: 1 })).toBe(
			'Every year 1 day after Easter Sunday'
		);
		expect(describeRule({ kind: 'easter', easter: 'orthodox', offset: 0 })).toBe(
			'Every year on Orthodox Easter'
		);
	});
});

describe('a date in another calendar', () => {
	it('builds and reads back every month and day, and each gives a day every year', () => {
		for (const calendar of CALENDAR_IDS)
			for (const month of CALENDARS[calendar].months)
				for (let date = 1; date <= month.days; date++) {
					const spec: RuleSpec = { kind: 'calendar', calendar, month: month.rule, day: date };
					const text = ruleText(spec);
					expect(parseRule(text), text).toEqual(spec);
					// Islamic years are shorter: some years have two of the same day.
					if (date === 1 || date === 15 || date === month.days)
						expect(daysOf(spec).length, text).toBeGreaterThanOrEqual(RULE_YEARS);
				}
	});

	it('writes the rules date-holidays reads', () => {
		expect(ruleText({ kind: 'calendar', calendar: 'hebrew', month: 'Nisan', day: 15 })).toBe(
			'15 Nisan'
		);
		expect(ruleText({ kind: 'calendar', calendar: 'hebrew', month: 'AdarII', day: 14 })).toBe(
			'14 AdarII'
		);
		expect(ruleText({ kind: 'calendar', calendar: 'islamic', month: 'Shawwal', day: 1 })).toBe(
			'1 Shawwal'
		);
		expect(ruleText({ kind: 'calendar', calendar: 'chinese', month: '08', day: 15 })).toBe(
			'chinese 08-0-15'
		);
		expect(ruleText({ kind: 'calendar', calendar: 'persian', month: 'Farvardin', day: 1 })).toBe(
			'1 Farvardin'
		);
	});

	it('Adar: Adar I in a leap year; AdarII: the second Adar, or Adar in other years', () => {
		// 5787 (2026-27) is a leap year; 5786 and 5788 are not.
		expect(checkRule('14 Adar', new Date(2026, 0, 1)).days.slice(0, 3)).toEqual([
			'2026-03-03',
			'2027-02-21',
			'2028-03-12'
		]);
		expect(checkRule('14 AdarII', new Date(2026, 0, 1)).days.slice(0, 3)).toEqual([
			'2026-03-03',
			'2027-03-23',
			'2028-03-12'
		]);
	});

	it('describes it', () => {
		const describe = (calendar: RuleSpec & { kind: 'calendar' }) => describeRule(calendar);
		expect(describe({ kind: 'calendar', calendar: 'hebrew', month: 'Nisan', day: 15 })).toBe(
			'Every year on 15 Nisan (Hebrew calendar)'
		);
		expect(describe({ kind: 'calendar', calendar: 'hebrew', month: 'AdarII', day: 14 })).toBe(
			'Every year on 14 Adar II (Hebrew calendar)'
		);
		expect(describe({ kind: 'calendar', calendar: 'hebrew', month: 'Iyyar', day: 5 })).toBe(
			'Every year on 5 Iyar (Hebrew calendar)'
		);
		expect(describe({ kind: 'calendar', calendar: 'islamic', month: 'Shawwal', day: 1 })).toBe(
			'Every year on 1 Shawwal (Islamic calendar)'
		);
		expect(describe({ kind: 'calendar', calendar: 'chinese', month: '08', day: 15 })).toBe(
			'Every year on day 15 of the 8th month (Chinese lunar calendar)'
		);
		expect(describe({ kind: 'calendar', calendar: 'persian', month: 'Farvardin', day: 1 })).toBe(
			'Every year on 1 Farvardin (Persian calendar)'
		);
	});

	it('warns about a day 30 that some years do not have', () => {
		expect(dayThirtyNote('hebrew', 'Cheshvan', 30)).toMatch(/no day 30/);
		expect(dayThirtyNote('hebrew', 'Kislev', 30)).toMatch(/no day 30/);
		expect(dayThirtyNote('hebrew', 'Adar', 30)).toMatch(/no day 30/);
		expect(dayThirtyNote('chinese', '12', 30)).toMatch(/no day 30/);
		expect(dayThirtyNote('islamic', 'Muharram', 30)).toMatch(/no day 30/);
		expect(dayThirtyNote('islamic', 'Ramadan', 29)).toBe('');
		expect(dayThirtyNote('persian', 'Mehr', 30)).toBe('');
		expect(dayThirtyNote('persian', 'Esfand', 30)).toMatch(/no day 30/);
		expect(CALENDARS.persian.months[0].days).toBe(31);
		expect(CALENDARS.persian.months[11].days).toBe(30);
		// Hebrew months that always have a 30th: no warning.
		for (const month of ['Tishrei', 'Shvat', 'Nisan', 'Sivan', 'Av'])
			expect(dayThirtyNote('hebrew', month, 30), month).toBe('');
	});

	it("doesn't offer a Hebrew 30th that never comes: Tevet, Adar II, Iyar, Tamuz and Elul have 29 days", () => {
		const hebrew = Object.fromEntries(CALENDARS.hebrew.months.map((m) => [m.rule, m.days]));
		expect(hebrew).toEqual({
			Tishrei: 30,
			Cheshvan: 30,
			Kislev: 30,
			Tevet: 29,
			Shvat: 30,
			Adar: 30,
			AdarII: 29,
			Nisan: 30,
			Iyyar: 29,
			Sivan: 30,
			Tamuz: 29,
			Av: 30,
			Elul: 29
		});
		// date-holidays rolls such a 30th over every year: "30 Elul" is just Rosh Hashanah.
		expect(checkRule('30 Elul', TODAY).days).toEqual(checkRule('1 Tishrei', TODAY).days);
		expect(dayThirtyNote('hebrew', 'Elul', 29)).toBe('');
	});

	it('says which months vary as date-holidays works them out', () => {
		// Each month's last day offered, over the next 10 years: does it ever (or always) roll
		// over to the 1st of a month?
		for (const calendar of CALENDAR_IDS) {
			const months = CALENDARS[calendar].months;
			const firsts = new Set(
				months.flatMap(
					(m) =>
						checkRule(ruleText({ kind: 'calendar', calendar, month: m.rule, day: 1 }), TODAY).days
				)
			);
			for (const month of months) {
				const last = ruleText({ kind: 'calendar', calendar, month: month.rule, day: month.days });
				const days = checkRule(last, TODAY).days;
				const rolled = days.filter((d) => firsts.has(d)).length;
				if (month.varies) {
					expect(rolled, `${last} rolls over some years`).toBeGreaterThan(0);
					expect(rolled, `${last} is a day of its month some years`).toBeLessThan(days.length);
				} else expect(rolled, `${last} never rolls over`).toBe(0);
				// A 29-day month's 30th would always roll over.
				if (month.days === 29) {
					const thirty = checkRule(`30 ${month.rule}`, TODAY).days;
					expect(
						thirty.every((d) => firsts.has(d)),
						`30 ${month.rule}`
					).toBe(true);
				}
			}
		}
	});
});

describe('parseRule', () => {
	it('reads a weekday with a small first letter (as date-holidays writes them)', () => {
		expect(parseRule('3rd monday in January')).toEqual({
			kind: 'weekday',
			nth: 3,
			weekday: 1,
			month: 1
		});
		expect(parseRule('07-04 if saturday then previous friday if sunday then next monday')).toEqual({
			kind: 'date',
			month: 7,
			day: 4,
			weekend: 'nearest'
		});
	});

	it("leaves rules the editor doesn't build as they are (Advanced)", () => {
		for (const text of [
			'',
			'11-20',
			'2026-11-20',
			'5th Friday in May',
			'last Monday in May',
			'3rd Monday in january',
			'3rd MONDAY in January',
			'3rd  Monday in January',
			'Monday before 01-01',
			'Monday before 06-02',
			'Friday after 12-24',
			'Thursday after 4th Thursday in November',
			'Friday after Thursday after 4th Thursday in November',
			'easter +1',
			'easter 0',
			'easter 05',
			'Easter -2',
			'easter -100',
			'chinese 13-0-01',
			'chinese 01-1-01',
			'chinese 1-0-1',
			'31 Tishrei',
			'30 Elul',
			'30 AdarII',
			'30 Tevet',
			'0 Nisan',
			'05 Nisan',
			'32 Farvardin',
			'31 Mehr',
			'15 nisan',
			'02-29 if Saturday then previous Friday if Sunday then next Monday',
			'02-30 if Saturday,Sunday then next Monday',
			'07-04 if Saturday, Sunday then next Monday',
			'07-04 and if Saturday then previous Friday',
			'03-02 in even years',
			'march equinox'
		])
			expect(parseRule(text), text).toBeNull();
	});
});

describe('ordinal', () => {
	it('names the months of the Chinese calendar', () => {
		expect([1, 2, 3, 4, 11, 12, 21, 22, 23].map(ordinal)).toEqual([
			'1st',
			'2nd',
			'3rd',
			'4th',
			'11th',
			'12th',
			'21st',
			'22nd',
			'23rd'
		]);
		expect(CALENDARS.chinese.months[7]).toMatchObject({ rule: '08', name: '8th month' });
	});
});

// --- Working out the days ----------------------------------------------------------------------

describe('checkRule', () => {
	it('gives the days from today (included) for 10 years', () => {
		const check = checkRule('11-22', TODAY);
		expect(check.readable).toBe(true);
		expect(check.days[0]).toBe('2026-11-22');
		expect(check.days).toHaveLength(RULE_YEARS);
		expect(check.days.at(-1)).toBe('2035-11-22');
		expect(checkRule('11-21', TODAY).days[0]).toBe('2027-11-21');
	});

	it("says when date-holidays can't read or work out a rule, without logging", () => {
		const log = vi.spyOn(console, 'error');
		for (const text of ['last Monday in May', 'nonsense', '', 'since 2027', 'in even years', 'P1D'])
			expect(checkRule(text, TODAY), text).toEqual({ readable: false, days: [], long: false });
		expect(log).not.toHaveBeenCalled();
	});

	it('marks a rule whose day lasts longer (a duration)', () => {
		expect(checkRule('12-21 P10D', TODAY)).toMatchObject({ readable: true, long: true });
		expect(checkRule('12-21', TODAY).long).toBe(false);
		// a day with a daylight saving change is still one day
		expect(checkRule('03-08', TODAY).long).toBe(false);
		expect(checkRule('11-01', TODAY).long).toBe(false);
	});

	it('remembers what it worked out', () => {
		const first = checkRule('4th Thursday in November', TODAY);
		expect(checkRule('4th Thursday in November', new Date(2026, 10, 22, 8))).toBe(first);
		expect(checkRule('4th Thursday in November', new Date(2026, 10, 27)).days[0]).toBe(
			'2027-11-25'
		);
	});
});

describe('ruleProblem', () => {
	it('accepts a rule that comes in the next 10 years', () => {
		expect(ruleProblem('3rd Monday in January', TODAY)).toBe('');
		expect(ruleProblem('03-02 in even years', TODAY)).toBe('');
		expect(ruleProblem('11-20 since 2027', TODAY)).toBe('');
		expect(ruleProblem('2028-07-04 if Saturday,Sunday then next Monday', TODAY)).toBe('');
	});

	it('refuses durations, impossible dates, unreadable rules and rules that never come', () => {
		expect(ruleProblem('  ', TODAY)).toBe('Please type a rule.');
		expect(ruleProblem('12-21 P10D', TODAY)).toBe(USE_A_RANGE);
		expect(ruleProblem('chinese 01-0-01 PT48H', TODAY)).toBe(USE_A_RANGE);
		expect(ruleProblem('02-29 if Sunday then next Monday', TODAY)).toBe(FEB_29_YEARLY);
		expect(ruleProblem('Monday before 02-29', TODAY)).toBe(FEB_29_YEARLY);
		expect(ruleProblem('2028-02-29 if Tuesday then next Wednesday', TODAY)).toBe('');
		expect(ruleProblem('2027-02-29 if Tuesday then next Wednesday', TODAY)).toMatch(
			/2027-02-29 isn't a real date/
		);
		expect(ruleProblem('04-31 if Saturday,Sunday then next Monday', TODAY)).toMatch(
			/04-31 isn't a real date/
		);
		expect(ruleProblem('13-01 since 2027', TODAY)).toMatch(/13-01 isn't a real date/);
		expect(ruleProblem('last Monday in May', TODAY)).toMatch(/can't read this rule/);
		expect(ruleProblem('since 2027', TODAY)).toMatch(/can't read this rule/);
		expect(ruleProblem('2020-05-01 if Sunday then next Monday', TODAY)).toBe(
			"It doesn't happen in the next 10 years."
		);
		expect(ruleProblem('11-20 prior to 2026', TODAY)).toBe(
			"It doesn't happen in the next 10 years."
		);
	});

	it("doesn't take another calendar's numbers for dates", () => {
		expect(ruleProblem('chinese 01-0-01', TODAY)).toBe('');
		expect(ruleProblem('15 Nisan', TODAY)).toBe('');
	});

	it('tidies the spaces of a typed rule', () => {
		expect(tidyRule('  3rd   Monday\tin January ')).toBe('3rd Monday in January');
	});
});

describe('ruleHolidays (what the slide shows for its own days)', () => {
	const options = { name: 'Fair', type: 'school' as const, school: 'short', recordId: 'r1' };

	it('gives the same days as date-holidays with all the rules set, without substitute days', () => {
		const rules = [
			'11-19',
			'2026-11-25',
			'1st Tuesday in May',
			'07-04 and if Saturday then previous Friday'
		];
		for (const year of [2026, 2027, 2028]) {
			const days = new Holidays();
			for (const rule of rules) days.setHoliday(rule, { ...options });
			expect(ruleHolidays(rules, year, options)).toEqual(
				days.getHolidays(year).filter((h) => !h.substitute)
			);
		}
		const [first] = ruleHolidays(['11-19'], 2026, options);
		expect(first).toMatchObject({ name: 'Fair', school: 'short', recordId: 'r1' });
		expect(first.date.slice(0, 10)).toBe('2026-11-19');
	});

	it('gives every rule its own options (date-holidays keeps its work in them)', () => {
		const shared = { ...options };
		const days = ruleHolidays(['11-19', '11-20'], 2026, shared);
		expect(days.map((d) => d.date.slice(0, 10))).toEqual(['2026-11-19', '2026-11-20']);
		expect(shared).toEqual(options);
	});

	it("leaves out a rule date-holidays can't work out, and still shows the rest", () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const days = ruleHolidays(['since 2027', '11-19', 'nonsense', 'in even years'], 2026, options);
		expect(days.map((d) => d.date.slice(0, 10))).toEqual(['2026-11-19']);
		expect(log.mock.calls.map(([text]) => text)).toEqual([
			'could not parse rule: nonsense',
			'could not work out rule: since 2027',
			'could not work out rule: in even years'
		]);
		log.mockClear();
		expect(ruleHolidays(['since 2027', '11-19'], 2026, options, { quiet: true })).toHaveLength(1);
		expect(ruleHolidays(['P2D', 'nonsense 2'], 2026, options, { quiet: true })).toEqual([]);
		expect(log).not.toHaveBeenCalled();
	});

	it('reports each rule it cannot use once (the calendar works its days out on every change)', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		for (const year of [2026, 2026, 2027])
			ruleHolidays(['nonsense 3', 'since 2030', '11-19'], year, options);
		expect(log.mock.calls.map(([text]) => text)).toEqual([
			'could not parse rule: nonsense 3',
			'could not work out rule: since 2030'
		]);
	});

	it('keeps the slide working when a record has such a rule', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const record = {
			id: 'rec000000000001',
			collectionId: 'pbc_326962381',
			collectionName: 'calendar_observances',
			created: '2026-01-01 00:00:00.000Z',
			updated: '',
			name: 'Fair',
			description: '',
			is_active: true,
			dates: ['', 'since 2027', '11-19'],
			image: '',
			icon: '',
			hidden: false,
			school: ''
		} as CalendarObservance;
		const map = observancesForMonth([record], 2026, 10);
		expect(map.get(19)?.map((h) => h.name)).toEqual(['Fair']);
		expect(map.get(26)?.map((h) => h.name)).toEqual(['Thanksgiving Day']);
	});

	it("shows a rule's days in the month view at the day the editor gives", () => {
		const record = (dates: string[]) =>
			({
				id: 'rec000000000002',
				collectionId: 'pbc_326962381',
				collectionName: 'calendar_observances',
				created: '2026-01-01 00:00:00.000Z',
				updated: '',
				name: 'Mine',
				description: '',
				is_active: true,
				dates,
				image: '',
				icon: '',
				hidden: false,
				school: ''
			}) as CalendarObservance;
		for (const pick of QUICK_PICKS) {
			const [next] = checkRule(pick.rule, TODAY).days;
			const [year, month, date] = next.split('-').map(Number);
			const shown = observancesForMonth([record([pick.rule])], year, month - 1).get(date);
			expect(
				shown?.some((h) => h.name === 'Mine'),
				pick.rule
			).toBe(true);
		}
	});
});

// --- Quick picks --------------------------------------------------------------------------------

describe('QUICK_PICKS', () => {
	/** Their days in 2026-2028 (as US calendars list them; Islamic ones as calculated). */
	const known: Record<string, string[]> = {
		'Lunar New Year': ['2026-02-17', '2027-02-06', '2028-01-26'],
		'Mid-Autumn Festival': ['2026-09-25', '2027-09-15', '2028-10-03'],
		Passover: ['2026-04-02', '2027-04-22', '2028-04-11'],
		'Rosh Hashanah': ['2026-09-12', '2027-10-02', '2028-09-21'],
		'Yom Kippur': ['2026-09-21', '2027-10-11', '2028-09-30'],
		Hanukkah: ['2026-12-05', '2027-12-25', '2028-12-13'],
		Purim: ['2026-03-03', '2027-03-23', '2028-03-12'],
		'Ramadan begins': ['2026-02-18', '2027-02-08', '2028-01-28'],
		'Eid al-Fitr': ['2026-03-20', '2027-03-09', '2028-02-26'],
		'Eid al-Adha': ['2026-05-27', '2027-05-16', '2028-05-05'],
		Nowruz: ['2026-03-21', '2027-03-21', '2028-03-20'],
		'Mardi Gras': ['2026-02-17', '2027-02-09', '2028-02-29'],
		'Ash Wednesday': ['2026-02-18', '2027-02-10', '2028-03-01'],
		'Palm Sunday': ['2026-03-29', '2027-03-21', '2028-04-09'],
		'Good Friday': ['2026-04-03', '2027-03-26', '2028-04-14'],
		'Orthodox Easter': ['2026-04-12', '2027-05-02', '2028-04-16'],
		"Grandparents' Day": ['2026-09-13', '2027-09-12', '2028-09-10']
	};

	it('gives the known days in 2026, 2027 and 2028', () => {
		expect(QUICK_PICKS.map((pick) => pick.name).sort()).toEqual(Object.keys(known).sort());
		for (const pick of QUICK_PICKS) {
			const days = checkRule(pick.rule, new Date(2026, 0, 1)).days.filter((d) => d < '2029');
			expect(days, pick.name).toEqual(known[pick.name]);
		}
	});

	it('each fills one of the kinds of day the editor builds, and passes its checks', () => {
		for (const pick of QUICK_PICKS) {
			const spec = parseRule(pick.rule);
			expect(spec, pick.rule).not.toBeNull();
			expect(ruleText(spec!)).toBe(pick.rule);
			expect(ruleProblem(pick.rule, TODAY), pick.rule).toBe('');
		}
	});

	it('none is called like a built-in holiday (Easter Sunday is one)', () => {
		const holidays = builtInHolidays(2025, 12);
		expect(findBuiltIn(holidays, 'Easter Sunday')).toBeDefined();
		for (const pick of QUICK_PICKS) {
			expect(findBuiltIn(holidays, pick.name), pick.name).toBeUndefined();
			expect(findBuiltIn(holidays, pick.label), pick.label).toBeUndefined();
		}
		expect(new Set(QUICK_PICKS.map((pick) => pick.rule)).size).toBe(QUICK_PICKS.length);
	});
});

describe('lists for the choices', () => {
	it('has every weekday and month as date-holidays writes them', () => {
		expect(WEEKDAYS).toHaveLength(7);
		expect(MONTHS).toHaveLength(12);
		expect(CALENDARS.hebrew.months.map((m) => m.rule)).toEqual([
			'Tishrei',
			'Cheshvan',
			'Kislev',
			'Tevet',
			'Shvat',
			'Adar',
			'AdarII',
			'Nisan',
			'Iyyar',
			'Sivan',
			'Tamuz',
			'Av',
			'Elul'
		]);
		expect(CALENDARS.islamic.months).toHaveLength(12);
		expect(CALENDARS.persian.months).toHaveLength(12);
	});
});
