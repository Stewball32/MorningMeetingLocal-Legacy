// The class's own days written as date-holidays rules: the ones the Days editor builds (and
// reads back from `dates`), and how any rule's days are worked out. The calendar slide works its
// days out with ruleHolidays() too (#lib/pb/calendar.ts ownDays), so the editor and the slide
// can't disagree. Each string here was checked with date-holidays (see rules.spec.ts):
// - every year on a date, moved off a weekend:
//   '07-04 if Saturday then previous Friday if Sunday then next Monday' (the nearest weekday),
//   '07-04 if Saturday,Sunday then next Monday', '07-04 if Saturday,Sunday then previous Friday';
// - a weekday of a month: '3rd Monday in January'. date-holidays can't read "last Monday in May",
//   so the last one is the weekday before the 1st of the next month, 'Monday before 06-01'
//   ("before" never counts the day itself: when Jun 1 is a Monday, it is May 25). December's is
//   'Friday after 12-25' ("after" counts the day itself, so not 12-24: when Dec 24 is a Friday,
//   Dec 31 is the last one). Then optionally a weekday before or after it:
//   'Friday after 4th Thursday in November';
// - counted from Easter: 'easter', 'easter -2', 'orthodox 1';
// - a date in another calendar: '15 Nisan' (Hebrew), '1 Shawwal' (Islamic),
//   'chinese 08-0-15' (Chinese lunar: month, 0 for not a leap month, day), '1 Farvardin' (Persian).
// Any other rule (typed in Advanced, or in the PocketBase dashboard) works too, as it is written.
//
// The rules of a class's own day have no timezone: date-holidays works them out in the browser's.
// Its `date` ('YYYY-MM-DD hh:mm:ss') is read as the local day, as the slide does.
import Holidays, { type HolidaysTypes } from 'date-holidays';

/** date-holidays' rules, for the Advanced box. */
export const SPEC_URL =
	'https://github.com/commenthol/date-holidays/blob/master/docs/specification.md';

/** How far ahead the editor looks for a rule's days. */
export const RULE_YEARS = 10;

/** Sunday first, as Date.getDay() counts. */
export const WEEKDAYS = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
] as const;

/** January first (month 1 is MONTHS[0]). */
export const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
] as const;

/** Which one of the weekdays in the month: 1st to 4th, or the last (a 5th isn't in every month). */
export type Nth = 1 | 2 | 3 | 4 | 'last';
export const NTHS: readonly Nth[] = [1, 2, 3, 4, 'last'];
const ORDINAL = ['', '1st', '2nd', '3rd', '4th'] as const;
export const nthText = (nth: Nth) => (nth === 'last' ? 'last' : ORDINAL[nth]);

/** What a yearly date does when it falls on a Saturday or Sunday. */
export type WeekendMove = 'keep' | 'nearest' | 'monday' | 'friday';
export const WEEKEND_MOVES: readonly { value: WeekendMove; label: string }[] = [
	{ value: 'keep', label: 'Keep it on that day' },
	{ value: 'nearest', label: 'Move it to the nearest weekday (Sat → Fri, Sun → Mon)' },
	{ value: 'monday', label: 'Move it to the Monday after' },
	{ value: 'friday', label: 'Move it to the Friday before' }
];
const WEEKEND_RULE: Record<Exclude<WeekendMove, 'keep'>, string> = {
	nearest: 'if Saturday then previous Friday if Sunday then next Monday',
	monday: 'if Saturday,Sunday then next Monday',
	friday: 'if Saturday,Sunday then previous Friday'
};
const WEEKEND_WORDS: Record<Exclude<WeekendMove, 'keep'>, string> = {
	nearest: 'the nearest weekday',
	monday: 'the Monday after',
	friday: 'the Friday before'
};

export type EasterKind = 'easter' | 'orthodox';
export const EASTER_NAME: Record<EasterKind, string> = {
	easter: 'Easter Sunday',
	orthodox: 'Orthodox Easter'
};
/** date-holidays counts at most 2 digits of days from Easter. */
export const MAX_EASTER_DAYS = 99;

export type CalendarId = 'hebrew' | 'islamic' | 'chinese' | 'persian';

export interface CalendarMonth {
	/** As the rule writes it. */
	rule: string;
	/** In descriptions: "14 Adar II". */
	name: string;
	/** In the month choice: "Adar II (in other years: Adar)". */
	label: string;
	/** The most days it has. */
	days: number;
	/** Some years it has a day less (then its last day rolls over: see dayThirtyNote). */
	varies: boolean;
}

export interface OtherCalendar {
	/** For the calendar choice. */
	label: string;
	/** In descriptions: "15 Nisan (Hebrew calendar)". */
	name: string;
	months: readonly CalendarMonth[];
}

/** A month of 30 days, or 29 in some years, called by its rule's name, unless told otherwise. */
const calendarMonth = (
	rule: string,
	{ days = 30, varies = true, name = rule, label = name }: Partial<Omit<CalendarMonth, 'rule'>> = {}
): CalendarMonth => ({ rule, name, label, days, varies });

/**
 * The calendars date-holidays can work out, with their month names as its parser writes them.
 * Hebrew months are listed from Tishrei (Rosh Hashanah), as Jewish calendars usually are.
 * Islamic and Chinese months have 29 or 30 days, depending on the year: a 30th that a month
 * doesn't have that year rolls over to the 1st of the next month (see dayThirtyNote). Hebrew
 * months have a set length, except Cheshvan, Kislev and Adar (Adar I has 30 days in a leap year,
 * Adar 29 in the others); date-holidays rolls a 30th of a 29-day month over every year, so
 * "30 Elul" would just be 1 Tishrei: those months only offer 29 days (rules.spec.ts checks it).
 */
export const CALENDARS: Record<CalendarId, OtherCalendar> = {
	hebrew: {
		label: 'Hebrew (Jewish)',
		name: 'Hebrew calendar',
		months: [
			calendarMonth('Tishrei', { varies: false }),
			calendarMonth('Cheshvan'),
			calendarMonth('Kislev'),
			calendarMonth('Tevet', { days: 29, varies: false }),
			calendarMonth('Shvat', { varies: false }),
			// A leap year has two months of Adar. date-holidays' "Adar" is then Adar I, and its
			// "AdarII" the second (Purim's); in other years both are the one Adar.
			calendarMonth('Adar', { label: 'Adar (Adar I in a leap year)' }),
			calendarMonth('AdarII', {
				days: 29,
				varies: false,
				name: 'Adar II',
				label: 'Adar II (in other years: Adar)'
			}),
			calendarMonth('Nisan', { varies: false }),
			calendarMonth('Iyyar', { days: 29, varies: false, name: 'Iyar' }),
			calendarMonth('Sivan', { varies: false }),
			calendarMonth('Tamuz', { days: 29, varies: false }),
			calendarMonth('Av', { varies: false }),
			calendarMonth('Elul', { days: 29, varies: false })
		]
	},
	islamic: {
		label: 'Islamic (Hijri)',
		name: 'Islamic calendar',
		months: [
			'Muharram',
			'Safar',
			'Rabi al-awwal',
			'Rabi al-thani',
			'Jumada al-awwal',
			'Jumada al-thani',
			'Rajab',
			'Shaban',
			'Ramadan',
			'Shawwal',
			'Dhu al-Qidah',
			'Dhu al-Hijjah'
		].map((name) => calendarMonth(name))
	},
	chinese: {
		label: 'Chinese lunar',
		name: 'Chinese lunar calendar',
		// Leap months are left out: the days people keep are in the ordinary ones.
		months: Array.from({ length: 12 }, (_, index) =>
			calendarMonth(String(index + 1).padStart(2, '0'), { name: `${ordinal(index + 1)} month` })
		)
	},
	persian: {
		label: 'Persian (Solar Hijri)',
		name: 'Persian calendar',
		months: [
			'Farvardin',
			'Ordibehesht',
			'Khordad',
			'Tir',
			'Mordad',
			'Shahrivar',
			'Mehr',
			'Aban',
			'Azar',
			'Dey',
			'Bahman',
			'Esfand'
		].map((name, index) =>
			// Esfand has a 30th only in a leap year.
			calendarMonth(name, { days: index < 6 ? 31 : 30, varies: name === 'Esfand' })
		)
	}
};
export const CALENDAR_IDS = Object.keys(CALENDARS) as CalendarId[];

/** "1st", "2nd", "3rd", "4th", "11th", "12th", "21st". */
export function ordinal(value: number): string {
	const tens = value % 100;
	if (tens >= 11 && tens <= 13) return `${value}th`;
	const suffix = ['th', 'st', 'nd', 'rd'][value % 10] ?? 'th';
	return `${value}${suffix}`;
}

/** A day of the class's own observance that the editor builds as a rule. */
export type RuleSpec =
	/** Every year on a date (month 1-12), moved when it falls on a weekend. */
	| { kind: 'date'; month: number; day: number; weekend: Exclude<WeekendMove, 'keep'> }
	/**
	 * Every year on the nth weekday (0-6, Sunday first) of a month (1-12); `then`: the weekday
	 * before or after that day instead (never the same weekday: "after" would give the day itself).
	 */
	| {
			kind: 'weekday';
			nth: Nth;
			weekday: number;
			month: number;
			then?: { direction: 'before' | 'after'; weekday: number };
	  }
	/** Every year `offset` days from Easter (negative: before; 0: Easter itself). */
	| { kind: 'easter'; easter: EasterKind; offset: number }
	/** Every year on a day of another calendar's month (`month`: CalendarMonth.rule). */
	| { kind: 'calendar'; calendar: CalendarId; month: string; day: number };

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

/** Days in a month (1-12) of a Gregorian year; 2000 (a leap year) by default. */
const daysInMonth = (month: number, year = 2000) => new Date(year, month, 0).getDate();

/** The rule string for a day the editor builds (what `dates` saves). */
export function ruleText(spec: RuleSpec): string {
	switch (spec.kind) {
		case 'date':
			return `${pad(spec.month)}-${pad(spec.day)} ${WEEKEND_RULE[spec.weekend]}`;
		case 'weekday': {
			const weekday = WEEKDAYS[spec.weekday];
			const base =
				spec.nth !== 'last'
					? `${ORDINAL[spec.nth]} ${weekday} in ${MONTHS[spec.month - 1]}`
					: spec.month === 12
						? `${weekday} after 12-25`
						: `${weekday} before ${pad(spec.month + 1)}-01`;
			return spec.then ? `${WEEKDAYS[spec.then.weekday]} ${spec.then.direction} ${base}` : base;
		}
		case 'easter':
			return spec.offset ? `${spec.easter} ${spec.offset}` : spec.easter;
		case 'calendar':
			return spec.calendar === 'chinese'
				? `chinese ${spec.month}-0-${pad(spec.day)}`
				: `${spec.day} ${spec.month}`;
	}
}

// --- Reading rules back -----------------------------------------------------------------------

const WEEKDAY = `(${WEEKDAYS.join('|')})`;
const MONTH = `(${MONTHS.join('|')})`;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CALENDAR_PATTERNS = (['hebrew', 'islamic', 'persian'] as const).map((calendar) => ({
	calendar,
	pattern: new RegExp(
		// The longer name first: "AdarII" before "Adar".
		`^(\\d{1,2}) (${[...CALENDARS[calendar].months]
			.map((m) => m.rule)
			.sort((a, b) => b.length - a.length)
			.map(escape)
			.join('|')})$`
	)
}));
const DATE_MOVED = new RegExp(
	`^(\\d{2})-(\\d{2}) (${Object.values(WEEKEND_RULE).map(escape).join('|')})$`
);
const NTH_WEEKDAY = new RegExp(`^(1st|2nd|3rd|4th) ${WEEKDAY} in ${MONTH}$`);
const LAST_WEEKDAY = new RegExp(`^${WEEKDAY} before (\\d{2})-01$`);
const LAST_IN_DECEMBER = new RegExp(`^${WEEKDAY} after 12-25$`);
const THEN = new RegExp(`^${WEEKDAY} (before|after) (.+)$`);
const EASTER = /^(easter|orthodox)(?: (-?\d{1,2}))?$/;
const CHINESE = /^chinese (\d{2})-0-(\d{2})$/;

/**
 * date-holidays reads a weekday with a capital or a small first letter ("monday", as its own
 * data writes them): the editor writes the capital one.
 */
const capitalWeekdays = (text: string) =>
	text.replace(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g, (word) => {
		return word[0].toUpperCase() + word.slice(1);
	});

function weekdayBase(text: string): Omit<Extract<RuleSpec, { kind: 'weekday' }>, 'then'> | null {
	let match = NTH_WEEKDAY.exec(text);
	if (match)
		return {
			kind: 'weekday',
			nth: ORDINAL.indexOf(match[1] as (typeof ORDINAL)[number]) as Nth,
			weekday: WEEKDAYS.indexOf(match[2] as (typeof WEEKDAYS)[number]),
			month: MONTHS.indexOf(match[3] as (typeof MONTHS)[number]) + 1
		};
	match = LAST_WEEKDAY.exec(text);
	if (match) {
		const next = Number(match[2]);
		if (next < 2 || next > 12) return null;
		return {
			kind: 'weekday',
			nth: 'last',
			weekday: WEEKDAYS.indexOf(match[1] as (typeof WEEKDAYS)[number]),
			month: next - 1
		};
	}
	match = LAST_IN_DECEMBER.exec(text);
	if (match)
		return {
			kind: 'weekday',
			nth: 'last',
			weekday: WEEKDAYS.indexOf(match[1] as (typeof WEEKDAYS)[number]),
			month: 12
		};
	return null;
}

function readRule(text: string): RuleSpec | null {
	let match = DATE_MOVED.exec(text);
	if (match) {
		const [month, day] = [Number(match[1]), Number(match[2])];
		const weekend = (Object.keys(WEEKEND_RULE) as (keyof typeof WEEKEND_RULE)[]).find(
			(key) => WEEKEND_RULE[key] === match![3]
		)!;
		if (month < 1 || month > 12 || day < 1 || day > daysInMonth(month)) return null;
		if (month === 2 && day === 29) return null;
		return { kind: 'date', month, day, weekend };
	}
	const base = weekdayBase(text);
	if (base) return base;
	match = THEN.exec(text);
	if (match) {
		const inner = weekdayBase(match[3]);
		const weekday = WEEKDAYS.indexOf(match[1] as (typeof WEEKDAYS)[number]);
		if (!inner || weekday === inner.weekday) return null;
		return { ...inner, then: { direction: match[2] as 'before' | 'after', weekday } };
	}
	match = EASTER.exec(text);
	if (match) {
		const offset = Number(match[2] ?? 0);
		return { kind: 'easter', easter: match[1] as EasterKind, offset };
	}
	match = CHINESE.exec(text);
	if (match) {
		const [month, day] = [Number(match[1]), Number(match[2])];
		if (month < 1 || month > 12 || day < 1 || day > 30) return null;
		return { kind: 'calendar', calendar: 'chinese', month: match[1], day };
	}
	for (const { calendar, pattern } of CALENDAR_PATTERNS) {
		match = pattern.exec(text);
		if (!match) continue;
		const day = Number(match[1]);
		const found = CALENDARS[calendar].months.find((m) => m.rule === match![2]);
		if (!found || day < 1 || day > found.days) return null;
		return { kind: 'calendar', calendar, month: found.rule, day };
	}
	return null;
}

/**
 * A saved rule as one of the days the editor builds, or null when it is written in any other way
 * (it then stays an "Advanced" rule, saved as it is). Only a rule the editor would write the same
 * way counts (apart from a small first letter of a weekday), so its description can't be wrong.
 */
export function parseRule(text: string): RuleSpec | null {
	const written = capitalWeekdays(text);
	const spec = readRule(written);
	return spec && ruleText(spec) === written ? spec : null;
}

// --- Describing -------------------------------------------------------------------------------

const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/** "Every year on the 3rd Monday in January", "Every year 2 days before Easter Sunday", … */
export function describeRule(spec: RuleSpec): string {
	switch (spec.kind) {
		case 'date':
			return `Every year on ${MONTH_DAY.format(new Date(2001, spec.month - 1, spec.day))} (on a weekend: ${WEEKEND_WORDS[spec.weekend]})`;
		case 'weekday': {
			const base = `the ${nthText(spec.nth)} ${WEEKDAYS[spec.weekday]} in ${MONTHS[spec.month - 1]}`;
			return spec.then
				? `Every year on the ${WEEKDAYS[spec.then.weekday]} ${spec.then.direction} ${base}`
				: `Every year on ${base}`;
		}
		case 'easter': {
			const name = EASTER_NAME[spec.easter];
			if (!spec.offset) return `Every year on ${name}`;
			const days = Math.abs(spec.offset);
			return `Every year ${days} ${days === 1 ? 'day' : 'days'} ${spec.offset < 0 ? 'before' : 'after'} ${name}`;
		}
		case 'calendar': {
			const calendar = CALENDARS[spec.calendar];
			const found = calendar.months.find((m) => m.rule === spec.month);
			const name = found?.name ?? spec.month;
			return spec.calendar === 'chinese'
				? `Every year on day ${spec.day} of the ${name} (${calendar.name})`
				: `Every year on ${spec.day} ${name} (${calendar.name})`;
		}
	}
}

/**
 * Why a day 30 may not come every year ('' when it does): Islamic and Chinese months, and the
 * Hebrew Cheshvan, Kislev and Adar, have 29 days in some years, and Esfand has 30 only in a leap
 * year. (A month that always has 29 days doesn't offer a 30th.)
 */
export function dayThirtyNote(calendar: CalendarId, monthRule: string, day: number): string {
	const month = CALENDARS[calendar].months.find((m) => m.rule === monthRule);
	return month?.varies && day === month.days
		? 'Some years this month has no day 30: then the calendar shows the day after (the 1st of the next month).'
		: '';
}

// --- Working out the days ---------------------------------------------------------------------

/**
 * Rules already reported in the console as unreadable: the calendar works its days out again on
 * every change (and the editor's lists on every letter typed), so each is reported once.
 */
const reported = new Set<string>();

/**
 * Sets a rule. date-holidays logs each rule it can't read ("could not parse rule"); `quiet`
 * keeps the editor's live check, which tries every letter typed, out of the console.
 */
function setRule(
	days: Holidays,
	rule: string,
	options: HolidaysTypes.HolidayOptions,
	quiet: boolean
): boolean {
	if (!quiet && !reported.has(rule)) {
		const set = days.setHoliday(rule, options);
		if (!set) reported.add(rule);
		return set;
	}
	const log = console.error;
	console.error = () => {};
	try {
		return days.setHoliday(rule, options);
	} finally {
		console.error = log;
	}
}

/** What the calendar shows of date-holidays' answer: not the substitute days. */
const shown = (days: Holidays, year: number) =>
	days.getHolidays(year).filter((holiday) => !holiday.substitute);

/** Whether date-holidays can work out a rule on its own in a year (see ruleHolidays). */
function worksAlone(rule: string, year: number): boolean {
	const days = new Holidays();
	if (!setRule(days, rule, { name: rule, type: 'school' }, true)) return true; // left out anyway
	try {
		shown(days, year);
		return true;
	} catch {
		return false;
	}
}

/**
 * The days a list of date-holidays rules gives in a year, each with `options` (each rule gets its
 * own copy: date-holidays keeps its work in it), soonest first. Not the substitute days, and a day
 * that two rules give is there once (date-holidays drops the same name on the same day). What the
 * slide shows for a class's own observance (calendar.ts ownDays).
 *
 * Some rules date-holidays reads but can't work out ('since 2027' or 'in even years' on their
 * own): it then throws for the whole list, so those are left out and the rest still show.
 */
export function ruleHolidays(
	rules: readonly string[],
	year: number,
	options: HolidaysTypes.HolidayOptions,
	{ quiet = false } = {}
): HolidaysTypes.Holiday[] {
	const days = new Holidays();
	for (const rule of rules) setRule(days, rule, { ...options }, quiet);
	try {
		return shown(days, year);
	} catch {
		const usable = rules.filter((rule) => worksAlone(rule, year));
		for (const rule of rules.filter((rule) => !usable.includes(rule))) {
			if (quiet || reported.has(rule)) continue;
			reported.add(rule);
			console.error(`could not work out rule: ${rule}`);
		}
		const again = new Holidays();
		for (const rule of usable) setRule(again, rule, { ...options }, true);
		return shown(again, year);
	}
}

/** What date-holidays makes of one rule, from a day on. */
export interface RuleCheck {
	/** date-holidays reads the rule and can work it out. */
	readable: boolean;
	/** Its days ('YYYY-MM-DD', local) from that day (included) for RULE_YEARS years, soonest first. */
	days: string[];
	/** A day of it lasts longer than a day (e.g. 'P3D'): the calendar shows only its first day. */
	long: boolean;
}

/** A day with a daylight saving change has 25 hours; a little more than that is "longer". */
const LONGEST_DAY_MS = 26 * 3_600_000;
const checks = new Map<string, RuleCheck>();
/** The live check works out every rule typed: forget old ones now and then. */
const MAX_CHECKS = 500;

const dayKey = (date: Date) =>
	`${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * A rule's days from `today` (included) for RULE_YEARS years, worked out as the slide does
 * (setRule and shown, as in ruleHolidays; the `date` read as the local day), and whether
 * date-holidays can read it at all. Remembered, so the editor's lists can ask on every change.
 */
export function checkRule(rule: string, today: Date): RuleCheck {
	const from = dayKey(today);
	const key = `${from} ${rule}`;
	const known = checks.get(key);
	if (known) return known;
	const result = workOut(rule, today, from);
	if (checks.size >= MAX_CHECKS) checks.clear();
	checks.set(key, result);
	return result;
}

function workOut(rule: string, today: Date, from: string): RuleCheck {
	const unreadable: RuleCheck = { readable: false, days: [], long: false };
	const days = new Holidays();
	if (!setRule(days, rule, { name: rule, type: 'school' }, true)) return unreadable;
	const year = today.getFullYear();
	const until = `${pad(year + RULE_YEARS, 4)}${from.slice(4)}`;
	const found = new Set<string>();
	let long = false;
	for (let y = year; y <= year + RULE_YEARS; y++) {
		let holidays: HolidaysTypes.Holiday[];
		try {
			holidays = shown(days, y);
		} catch {
			// One that ruleHolidays leaves out ('since 2027' on its own).
			return unreadable;
		}
		for (const holiday of holidays) {
			const day = holiday.date.slice(0, 10);
			if (day < from || day >= until) continue;
			found.add(day);
			if (+holiday.end - +holiday.start > LONGEST_DAY_MS) long = true;
		}
	}
	return { readable: true, days: [...found].sort(), long };
}

// --- Checking a rule before it is added ---------------------------------------------------------

/** The same words as the date picker's (dates.ts dayProblem). */
export const FEB_29_YEARLY =
	"Feb 29 can't repeat every year (most years don't have one). Add it as a one-time day.";
export const USE_A_RANGE =
	'For several days in a row, use a range instead: choose “On a date”, then “Add several days in a row”.';

/** A duration (ISO 8601, as date-holidays reads it): 'P3D', 'PT12H'. */
const DURATION = /(?:^|\s)P(?:\d+D|T\d)/;
/** A Gregorian date at the start of a rule, or right after "before" / "after". */
const DATE_IN_RULE = /(?:^|\b(?:before|after) )(?:0*(\d{1,4})-)?0?(\d{1,2})-0?(\d{1,2})(?![\d-])/g;

/** Rules are kept as typed, but with single spaces (date-holidays reads no double ones). */
export const tidyRule = (text: string) => text.trim().replace(/\s+/g, ' ');

/**
 * Why a rule can't be added ('' when it can): it must be readable, give at least one day in the
 * next RULE_YEARS years, last a day (several days in a row are a range), and its dates must
 * exist (date-holidays moves Feb 30 to Mar 2, and a yearly Feb 29 to Mar 1 in most years).
 */
export function ruleProblem(rule: string, today: Date): string {
	if (!rule.trim()) return 'Please type a rule.';
	if (DURATION.test(rule)) return USE_A_RANGE;
	for (const [, yearText, monthText, dayText] of rule.matchAll(DATE_IN_RULE)) {
		const [month, day] = [Number(monthText), Number(dayText)];
		const year = yearText === undefined ? undefined : Number(yearText);
		if (month < 1 || month > 12 || day < 1 || day > daysInMonth(month, year))
			return `${yearText === undefined ? '' : `${yearText}-`}${pad(month)}-${pad(day)} isn't a real date. Please check it.`;
		if (year === undefined && month === 2 && day === 29) return FEB_29_YEARLY;
	}
	const check = checkRule(rule, today);
	if (!check.readable)
		return "The calendar can't read this rule. Check it against the examples on the rules page.";
	if (check.long) return USE_A_RANGE;
	if (check.days.length === 0) return `It doesn't happen in the next ${RULE_YEARS} years.`;
	return '';
}

// --- Quick picks ------------------------------------------------------------------------------

export interface QuickPick {
	/** In the list. */
	label: string;
	/** The name it gives the observance (when the name is still empty). */
	name: string;
	/** As date-holidays' own country data writes it, where it has the day. */
	rule: string;
	group: string;
}

/**
 * Common days that move from year to year and aren't built-in holidays (rules.spec.ts checks
 * each one's days in 2026-2028, and that none is called like a built-in holiday).
 *
 * Diwali is left out: date-holidays can't work it out (it follows the Hindu lunisolar calendar;
 * its country data only lists a fixed date for each year).
 */
export const QUICK_PICKS: readonly QuickPick[] = [
	// CN, ID, BN: 'chinese 01-0-01'; CN: 'chinese 08-0-15'
	{
		group: 'Chinese calendar',
		label: 'Lunar New Year',
		name: 'Lunar New Year',
		rule: 'chinese 01-0-01'
	},
	{
		group: 'Chinese calendar',
		label: 'Mid-Autumn Festival',
		name: 'Mid-Autumn Festival',
		rule: 'chinese 08-0-15'
	},
	// IL and names.yaml; Hanukkah and Purim are 'P8D' / 'P2D' there: here only their first day.
	{ group: 'Jewish', label: 'Passover (first day)', name: 'Passover', rule: '15 Nisan' },
	{ group: 'Jewish', label: 'Rosh Hashanah', name: 'Rosh Hashanah', rule: '1 Tishrei' },
	{ group: 'Jewish', label: 'Yom Kippur', name: 'Yom Kippur', rule: '10 Tishrei' },
	{ group: 'Jewish', label: 'Hanukkah (first day)', name: 'Hanukkah', rule: '25 Kislev' },
	// AdarII: Adar II in a leap year, Adar in the others; Purim is in the second Adar.
	{ group: 'Jewish', label: 'Purim', name: 'Purim', rule: '14 AdarII' },
	// names.yaml
	{ group: 'Islamic', label: 'Ramadan begins', name: 'Ramadan begins', rule: '1 Ramadan' },
	{ group: 'Islamic', label: 'Eid al-Fitr', name: 'Eid al-Fitr', rule: '1 Shawwal' },
	{ group: 'Islamic', label: 'Eid al-Adha', name: 'Eid al-Adha', rule: '10 Dhu al-Hijjah' },
	// IR
	{ group: 'Persian', label: 'Nowruz (Persian New Year)', name: 'Nowruz', rule: '1 Farvardin' },
	// names.yaml; Mardi Gras: US (Louisiana)
	{ group: 'Christian', label: 'Mardi Gras', name: 'Mardi Gras', rule: 'easter -47' },
	{ group: 'Christian', label: 'Ash Wednesday', name: 'Ash Wednesday', rule: 'easter -46' },
	{ group: 'Christian', label: 'Palm Sunday', name: 'Palm Sunday', rule: 'easter -7' },
	{ group: 'Christian', label: 'Good Friday', name: 'Good Friday', rule: 'easter -2' },
	{ group: 'Christian', label: 'Orthodox Easter', name: 'Orthodox Easter', rule: 'orthodox' },
	// Not in date-holidays: the Sunday after Labor Day (US).
	{
		group: 'Other',
		label: "Grandparents' Day",
		name: "Grandparents' Day",
		rule: 'Sunday after 1st Monday in September'
	}
];
