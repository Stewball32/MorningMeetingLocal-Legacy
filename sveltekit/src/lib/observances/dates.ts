// The days of a class's own observance, as the editor handles them. They are stored in the
// record's `dates` (a JSON array) as date-holidays rules:
// - 'YYYY-MM-DD': that day only;
// - 'MM-DD': that day every year (not Feb 29: date-holidays would move it to Mar 1 in most years);
// - the other rules the Days editor builds (a weekday of a month, counted from Easter, a date in
//   another calendar, a yearly date moved off a weekend: see rules.ts), or one typed in Advanced.
// Anything else (written in the PocketBase dashboard) is kept exactly as it is.
//
// Only local dates: the date picker gives 'YYYY-MM-DD' text and days are counted with
// new Date(year, month - 1, day). new Date('YYYY-MM-DD') would be UTC midnight, which is the
// evening before in America.
import {
	checkRule,
	describeRule,
	FEB_29_YEARLY,
	parseRule,
	ruleProblem,
	ruleText,
	tidyRule,
	type RuleCheck
} from './rules.ts';

/** Years the editor accepts (a typo like 0202 or 20266 is refused). */
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2099;
/** The longest range "Add days" expands, so a typo in a year can't add thousands of days. */
export const MAX_RANGE_DAYS = 100;

const ONE_TIME = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEARLY = /^(\d{2})-(\d{2})$/;

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

/** 'YYYY-MM-DD' of a local date. */
export function dayString(date: Date): string {
	return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight of a 'YYYY-MM-DD' day (check it with isDayString first). */
export function dayDate(day: string): Date {
	const [, year, month, date] = ONE_TIME.exec(day)!.map(Number);
	const result = new Date(year, month - 1, date);
	// new Date() reads years 0-99 as 1900-1999.
	result.setFullYear(year);
	return result;
}

/** Local midnight of the same day (drops the time). */
export const startOfDay = (date: Date) =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** `days` calendar days later (or earlier), at local midnight; DST changes don't matter. */
export const addDays = (date: Date, days: number) =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** Calendar days from `a` to `b` (both local), e.g. 1 from today to tomorrow. */
export function daysBetween(a: Date, b: Date): number {
	const utc = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
	return Math.round((utc(b) - utc(a)) / 86_400_000);
}

export const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

/** Days in a month (1-12); February has 29 in a leap year. */
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

/** Whether `text` is a real day 'YYYY-MM-DD' between MIN_YEAR and MAX_YEAR. */
export function isDayString(text: string): boolean {
	const match = ONE_TIME.exec(text);
	if (!match) return false;
	const [, year, month, day] = match.map(Number);
	return (
		year >= MIN_YEAR &&
		year <= MAX_YEAR &&
		month >= 1 &&
		month <= 12 &&
		day >= 1 &&
		day <= daysInMonth(year, month)
	);
}

/** Whether `text` is a day that can repeat every year, 'MM-DD' (Feb 29 can't). */
export function isYearlyString(text: string): boolean {
	const match = YEARLY.exec(text);
	if (!match) return false;
	const [, month, day] = match.map(Number);
	if (month === 2 && day === 29) return false;
	return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(2001, month);
}

/** Why a picked day can't be added, or '' when it can. */
export function dayProblem(text: string, yearly = false): string {
	if (!text.trim()) return 'Please choose a day.';
	if (!ONE_TIME.test(text)) return 'Please choose a day with the date picker.';
	if (!isDayString(text)) {
		const year = Number(text.slice(0, 4));
		return year < MIN_YEAR || year > MAX_YEAR
			? `Please choose a day between ${MIN_YEAR} and ${MAX_YEAR}.`
			: "That day doesn't exist. Please choose it again.";
	}
	if (yearly && text.slice(5) === '02-29') return FEB_29_YEARLY;
	return '';
}

/** One of an observance's days in the form. */
export type DayEntry =
	/** That day only. */
	| { kind: 'once'; day: string }
	/**
	 * Every year on `day`'s month and day ('MM-DD' when saved); `day` is its next date (today
	 * included), as yearlyEntry and entryFromSaved make it.
	 */
	| { kind: 'yearly'; day: string }
	/**
	 * A date-holidays rule, saved as `rule`: one the editor builds (parseRule reads it back), or
	 * one typed in Advanced.
	 */
	| { kind: 'rule'; rule: string }
	/**
	 * Saved in the PocketBase dashboard in a form the editor doesn't build: `value` is saved back
	 * exactly as it was (any JSON value); `text` shows it. Text is still a date-holidays rule that
	 * the calendar may show (see entryCheck).
	 */
	| { kind: 'other'; text: string; value: unknown };

/** The next time a yearly 'MM-DD' comes (today included), as 'YYYY-MM-DD'. */
export function nextYearly(monthDay: string, today: Date): string {
	const year = today.getFullYear();
	const thisYear = `${pad(year, 4)}-${monthDay}`;
	return dayDate(thisYear) >= startOfDay(today) ? thisYear : `${pad(year + 1, 4)}-${monthDay}`;
}

/**
 * Every year on the month and day of `day` ('YYYY-MM-DD', e.g. the date picked), shown with its
 * next date from `today`: a day picked in a month that has passed comes next year.
 */
export const yearlyEntry = (day: string, today: Date): DayEntry => ({
	kind: 'yearly',
	day: nextYearly(day.slice(5), today)
});

/** A saved `dates` entry, for the form. */
export function entryFromSaved(value: unknown, today: Date): DayEntry {
	if (typeof value === 'string' && isDayString(value)) return { kind: 'once', day: value };
	if (typeof value === 'string' && isYearlyString(value))
		return { kind: 'yearly', day: nextYearly(value, today) };
	if (typeof value === 'string' && parseRule(value)) return { kind: 'rule', rule: value };
	const text = typeof value === 'string' ? value : JSON.stringify(value);
	return { kind: 'other', text: text ?? String(value), value };
}

/**
 * What is saved for an entry, as text (to compare entries). savedDates saves an 'other' entry's
 * own value, which may not be text.
 */
export function savedValue(entry: DayEntry): string {
	if (entry.kind === 'once') return entry.day;
	if (entry.kind === 'yearly') return entry.day.slice(5);
	if (entry.kind === 'rule') return entry.rule;
	return entry.text;
}

/**
 * The value a duplicate check compares: one-time and yearly days on the same date are not the
 * same; a rule is the same as the same text saved in the dashboard. A rule the editor builds is
 * compared as the editor writes it: date-holidays reads 'monday' as 'Monday' (parseRule), so
 * '3rd monday in January' is the 3rd Monday in January already in the list.
 */
export function keyOf(entry: DayEntry): string {
	const rule = entryRule(entry);
	if (rule === null) return `${entry.kind}:${savedValue(entry)}`;
	const spec = parseRule(rule);
	return `rule:${spec ? ruleText(spec) : rule}`;
}

/** The date-holidays rule of a rule entry, or of an 'other' one saved as text; else null. */
export function entryRule(entry: DayEntry): string | null {
	if (entry.kind === 'rule') return entry.rule;
	if (entry.kind === 'other' && typeof entry.value === 'string') return entry.value;
	return null;
}

/**
 * What date-holidays makes of a rule or 'other' entry from `today` (see checkRule); null for
 * one-time and yearly days. An 'other' entry that isn't text can't be read (the slide skips it).
 */
export function entryCheck(entry: DayEntry, today: Date): RuleCheck | null {
	if (entry.kind === 'once' || entry.kind === 'yearly') return null;
	const rule = entryRule(entry);
	return rule === null ? { readable: false, days: [], long: false } : checkRule(rule, today);
}

/** An entry's next day from `today` (included), or null (passed, or never again). */
export function entryNext(entry: DayEntry, today: Date): Date | null {
	if (entry.kind === 'once') {
		const date = dayDate(entry.day);
		return date >= startOfDay(today) ? date : null;
	}
	// A yearly entry shows its next date (yearlyEntry and entryFromSaved make it so).
	if (entry.kind === 'yearly') return dayDate(entry.day);
	const next = entryCheck(entry, today)?.days[0];
	return next ? dayDate(next) : null;
}

/** Whether an entry already covers `entry` (the same day, or every year on that month and day). */
export function covers(existing: DayEntry, entry: DayEntry): boolean {
	if (keyOf(existing) === keyOf(entry)) return true;
	return (
		existing.kind === 'yearly' &&
		entry.kind === 'once' &&
		existing.day.slice(5) === entry.day.slice(5)
	);
}

/**
 * Sorted for showing and saving: one-time and yearly days by the date shown (a yearly day by
 * its next date), then the rules in the order they were added (or saved), then the entries the
 * editor doesn't build, in their saved order.
 */
export function sortEntries(entries: readonly DayEntry[]): DayEntry[] {
	const dated = entries.filter((entry) => entry.kind === 'once' || entry.kind === 'yearly');
	const rules = entries.filter((entry) => entry.kind === 'rule');
	const others = entries.filter((entry) => entry.kind === 'other');
	dated.sort((a, b) => {
		const dayA = (a as { day: string }).day;
		const dayB = (b as { day: string }).day;
		if (dayA !== dayB) return dayA < dayB ? -1 : 1;
		return a.kind === b.kind ? 0 : a.kind === 'once' ? -1 : 1;
	});
	return [...dated, ...rules, ...others];
}

/**
 * What `dates` saves for the entries: one-time days in date order, then the yearly ones in
 * month-day order, then the rules in their order, then the rest exactly as they were saved (a
 * number stays a number). Duplicates are left out. The same entries always give the same list,
 * so comparing lists tells whether the days changed.
 */
export function savedDates(entries: readonly DayEntry[]): unknown[] {
	const once = entries.flatMap((entry) => (entry.kind === 'once' ? [entry.day] : [])).sort();
	const yearly = entries
		.flatMap((entry) => (entry.kind === 'yearly' ? [entry.day.slice(5)] : []))
		.sort();
	const rules = entries.flatMap((entry) => (entry.kind === 'rule' ? [entry.rule] : []));
	const others = entries.flatMap((entry) => (entry.kind === 'other' ? [entry.value] : []));
	return [...new Set<unknown>([...once, ...yearly, ...rules, ...others])];
}

export interface AddResult {
	entries: DayEntry[];
	/** How many were added. */
	added: number;
	/** Days that were already there (one-time days, or covered by a yearly one). */
	alreadyThere: DayEntry[];
	/** One-time days dropped because a yearly day added now covers them. */
	replaced: DayEntry[];
}

/**
 * Adds days to the list, without duplicates: a day that is already there (or that a yearly
 * day covers) is skipped, and a yearly day replaces the one-time days it covers.
 */
export function addEntries(entries: readonly DayEntry[], adding: readonly DayEntry[]): AddResult {
	let list = [...entries];
	const alreadyThere: DayEntry[] = [];
	const replaced: DayEntry[] = [];
	let added = 0;
	for (const entry of adding) {
		if (list.some((existing) => covers(existing, entry))) {
			alreadyThere.push(entry);
			continue;
		}
		if (entry.kind === 'yearly') {
			const covered = list.filter((existing) => covers(entry, existing));
			replaced.push(...covered);
			list = list.filter((existing) => !covered.includes(existing));
		}
		list.push(entry);
		added++;
	}
	return { entries: sortEntries(list), added, alreadyThere, replaced };
}

/**
 * Switches "every year" on or off for the entry at `index`. Turning it on drops one-time days on
 * that month and day, and shows its next date from `today`; turning it off keeps the date shown.
 * An entry that is then a duplicate is merged. Feb 29 can't repeat.
 */
export function setYearly(
	entries: readonly DayEntry[],
	index: number,
	yearly: boolean,
	today: Date
): { entries: DayEntry[] } | { error: string } {
	const entry = entries[index];
	if (!entry || entry.kind === 'other' || entry.kind === 'rule') return { entries: [...entries] };
	if ((entry.kind === 'yearly') === yearly) return { entries: [...entries] };
	if (yearly) {
		const problem = dayProblem(entry.day, true);
		if (problem) return { error: problem };
	}
	const rest = entries.filter((_, at) => at !== index);
	const changed: DayEntry = yearly
		? yearlyEntry(entry.day, today)
		: { kind: 'once', day: entry.day };
	return { entries: addEntries(rest, [changed]).entries };
}

export type RangeResult = { days: string[]; skippedWeekends: number } | { error: string };

/**
 * The days from `from` to `to` (both 'YYYY-MM-DD', included), leaving out Saturdays and
 * Sundays with `skipWeekends`; at most MAX_RANGE_DAYS days long.
 */
export function expandRange(
	from: string,
	to: string,
	{ skipWeekends = false, yearly = false } = {}
): RangeResult {
	const fromProblem = dayProblem(from);
	if (fromProblem) return { error: `First day: ${fromProblem}` };
	const toProblem = dayProblem(to);
	if (toProblem) return { error: `Last day: ${toProblem}` };
	const start = dayDate(from);
	const end = dayDate(to);
	const length = daysBetween(start, end) + 1;
	if (length < 1) return { error: 'The last day must be on or after the first day.' };
	if (length > MAX_RANGE_DAYS)
		return {
			error: `That is ${length} days; a range can be up to ${MAX_RANGE_DAYS} days. Please check the dates.`
		};
	const days: string[] = [];
	let skippedWeekends = 0;
	for (let offset = 0; offset < length; offset++) {
		const date = addDays(start, offset);
		if (skipWeekends && isWeekend(date)) {
			skippedWeekends++;
			continue;
		}
		days.push(dayString(date));
	}
	if (yearly && days.some((day) => day.slice(5) === '02-29'))
		return {
			error:
				"The range includes Feb 29, which can't repeat every year. Turn off Every year, or add Feb 29 on its own."
		};
	if (days.length === 0) return { error: 'Those days are all on a weekend.' };
	return { days, skippedWeekends };
}

const LONG = new Intl.DateTimeFormat('en-US', {
	weekday: 'short',
	month: 'short',
	day: 'numeric',
	year: 'numeric'
});
const SHORT = new Intl.DateTimeFormat('en-US', {
	weekday: 'short',
	month: 'short',
	day: 'numeric'
});
const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/** "Wed, Nov 25, 2026"; without the year ("Wed, Nov 25") when `withYear` is false. */
export function formatDay(date: Date, withYear = true): string {
	return (withYear ? LONG : SHORT).format(date);
}

/** "Nov 25" for a 'MM-DD' or 'YYYY-MM-DD' day. */
export function formatMonthDay(day: string): string {
	const monthDay = day.length === 5 ? day : day.slice(5);
	// 2000 is a leap year, so Feb 29 stays Feb 29.
	return MONTH_DAY.format(
		new Date(2000, Number(monthDay.slice(0, 2)) - 1, Number(monthDay.slice(3)))
	);
}

/**
 * How the form's list shows an entry: "Wed, Nov 25, 2026", "Every year on Nov 19", "Every year
 * on the 3rd Monday in January", or a rule as it is written.
 */
export function describeEntry(entry: DayEntry): string {
	if (entry.kind === 'once') return formatDay(dayDate(entry.day));
	if (entry.kind === 'yearly') return `Every year on ${formatMonthDay(entry.day)}`;
	if (entry.kind === 'rule') {
		const spec = parseRule(entry.rule);
		return spec ? describeRule(spec) : entry.rule;
	}
	return entry.text;
}

/** A date as date-holidays reads one ('2026-11-25', '11-25', '2-5'): for rules typed in Advanced. */
const PLAIN_DATE = /^(?:0*(\d{1,4})-)?0?(\d{1,2})-0?(\d{1,2})$/;

/**
 * The entry for a rule typed in Advanced (or built in the Days editor), or why it can't be
 * added. A plain date becomes a one-time or yearly day, with the date picker's checks (Feb 29
 * can't repeat every year). Any other rule must pass ruleProblem.
 */
export function ruleEntry(text: string, today: Date): { entry: DayEntry } | { error: string } {
	const rule = tidyRule(text);
	const plain = PLAIN_DATE.exec(rule);
	if (plain) {
		const [, year, month, day] = plain;
		const monthDay = `${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
		if (year !== undefined) {
			const once = `${year.padStart(4, '0')}-${monthDay}`;
			const problem = dayProblem(once);
			return problem ? { error: problem } : { entry: { kind: 'once', day: once } };
		}
		// 2000 is a leap year, so Feb 29 gets its own words.
		const problem = dayProblem(`2000-${monthDay}`, true);
		return problem ? { error: problem } : { entry: yearlyEntry(`2000-${monthDay}`, today) };
	}
	const problem = ruleProblem(rule, today);
	return problem ? { error: problem } : { entry: { kind: 'rule', rule } };
}
