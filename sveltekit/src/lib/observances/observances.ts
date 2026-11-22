// Pure helpers for the Calendar Observances page: the sections it shows, worked out from the
// records the same way the calendar slide does (#lib/pb/calendar.ts).
import type { DescribeOptions } from '#lib/editor/errors.ts';
import { compareByName, plural } from '#lib/editor/list.ts';
import {
	builtInDays,
	findBuiltIn,
	holidaySettings,
	isSameHolidayName,
	isSettingsRecord,
	observancesForMonth,
	rawDates,
	type BuiltInHoliday,
	type Holiday,
	type IconLookup,
	type School
} from '#lib/pb/calendar.ts';
import type { CalendarObservance, IconRecord } from '#lib/pb/types.ts';
import {
	addDays,
	dayDate,
	describeEntry,
	entryFromSaved,
	formatDay,
	sortEntries,
	startOfDay,
	type DayEntry
} from './dates.ts';

/** Shown when an observance has no picture (or it fails to load), like the slide. */
export const DEFAULT_PICTURE = '/defaults/calendar.png';

/** For describeError: "this observance no longer exists. It may have been deleted ..." */
export const OBSERVANCE_ERRORS = { noun: 'observance' } satisfies DescribeOptions;

/** The form's names for the school days. */
export const SCHOOL_LABEL: Record<School, string> = {
	none: 'No school',
	short: 'Short day',
	full: 'Regular day'
};

/** What the slide's day cell says (nothing on a regular day). */
export const SLIDE_BADGE: Record<School, string> = {
	none: 'No School!',
	short: 'Short Day!',
	full: ''
};

/** "Coming up" looks this many days ahead (today included). */
export const COMING_UP_DAYS = 60;

/** A school year starts on August 1 (month 7 of 0-11) and ends on July 31. */
export const SCHOOL_YEAR_START_MONTH = 7;

export interface SchoolYear {
	/** Aug 1 */
	start: Date;
	/** Aug 1 of the next year (not included). */
	end: Date;
	/** "2026–27" */
	label: string;
}

export function schoolYear(today: Date): SchoolYear {
	const first =
		today.getMonth() >= SCHOOL_YEAR_START_MONTH ? today.getFullYear() : today.getFullYear() - 1;
	return {
		start: new Date(first, SCHOOL_YEAR_START_MONTH, 1),
		end: new Date(first + 1, SCHOOL_YEAR_START_MONTH, 1),
		label: `${first}–${String(first + 1).slice(2)}`
	};
}

/** The school day a value means ('' was never set: the holiday's own, else a regular day). */
export function schoolOf(value: CalendarObservance['school'], fallback: School = 'full'): School {
	return value === 'none' || value === 'short' || value === 'full' ? value : fallback;
}

/** Finds a record's icon in the page's (live) list of icons, else in what came with the record. */
export function iconLookup(icons: readonly IconRecord[]): IconLookup {
	const byId = new Map(icons.map((icon) => [icon.id, icon]));
	return (record) => {
		if (!record.icon) return undefined;
		return (
			byId.get(record.icon) ??
			(record.expand?.icon?.id === record.icon ? record.expand.icon : undefined)
		);
	};
}

/** For data-* attributes and ids: "Veterans Day" -> "veterans-day". */
export const slug = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

/** Oldest first (the order in which the slide adds up a holiday's settings). */
const byCreated = (a: CalendarObservance, b: CalendarObservance) =>
	a.created === b.created ? (a.id < b.id ? -1 : 1) : a.created < b.created ? -1 : 1;

/**
 * The settings records (no dates) for a built-in holiday, the one the editor changes first:
 * the newest active one, else the newest. The rest were made in the PocketBase dashboard.
 */
export function settingsRecordsFor(
	records: readonly CalendarObservance[],
	holiday: string
): CalendarObservance[] {
	const matching = records
		.filter((record) => isSettingsRecord(record) && isSameHolidayName(record.name ?? '', holiday))
		.sort(byCreated)
		.reverse();
	return [
		...matching.filter((record) => record.is_active),
		...matching.filter((record) => !record.is_active)
	];
}

/** One built-in holiday in the list. */
export interface BuiltInRow {
	holiday: BuiltInHoliday;
	key: string;
	/** Its day this school year; null when it has none (Election Day comes every 4 years). */
	date: Date | null;
	/** The weekday it is observed on this school year, when it falls on a weekend. */
	observed: Date | null;
	/** With no day this school year: its next day. */
	next: Date | null;
	/** The settings record the editor changes (Customize, Hide), if it has one. */
	record: CalendarObservance | undefined;
	/** More settings records for it (made in the PocketBase dashboard); they count too. */
	extra: CalendarObservance[];
	/** As the slide shows it. */
	school: School;
	hidden: boolean;
	/** The picture's URL; '' for the default. */
	picture: string;
	description: string;
}

/** The days of a built-in holiday from `from` (included) to `to` (not included). */
function daysOf(holiday: string, from: Date, to: Date) {
	const days = [];
	for (let year = from.getFullYear(); year <= to.getFullYear(); year++) {
		for (const day of builtInDays(year)) {
			if (day.holiday === holiday && day.dateObj >= from && day.dateObj < to) days.push(day);
		}
	}
	return days;
}

/**
 * Every built-in holiday with its day this school year and what has been changed, in the order
 * of the school year (those with no day this year last).
 */
export function builtInRows(
	holidays: readonly BuiltInHoliday[],
	records: readonly CalendarObservance[],
	today: Date,
	iconOf: IconLookup
): BuiltInRow[] {
	const year = schoolYear(today);
	const settings = holidaySettings(records, iconOf);
	const rows = holidays.map((holiday): BuiltInRow => {
		const days = daysOf(holiday.name, year.start, year.end);
		const main = days.find((day) => !day.observed);
		const observed = days.find((day) => day.observed);
		let next: Date | null = null;
		if (!main) {
			const later = daysOf(holiday.name, year.end, new Date(year.end.getFullYear() + 8, 0, 1));
			next = later.find((day) => !day.observed)?.dateObj ?? null;
		}
		const [record, ...extra] = settingsRecordsFor(records, holiday.name);
		const changes = settings.get(holiday.name);
		return {
			holiday,
			key: slug(holiday.name),
			date: main?.dateObj ?? null,
			observed: observed?.dateObj ?? null,
			next,
			record,
			extra,
			school: schoolOf(changes?.school ?? '', holiday.school),
			hidden: !!changes?.hidden,
			picture: changes?.image ?? '',
			description: changes?.description ?? ''
		};
	});
	const time = (row: BuiltInRow) => (row.date ?? row.next)?.getTime() ?? Infinity;
	return rows.sort((a, b) => Number(!a.date) - Number(!b.date) || time(a) - time(b));
}

/** One of the class's own observance records in the list. */
export interface OwnRow {
	record: CalendarObservance;
	entries: DayEntry[];
	/** Its next day from today (a yearly day's next one); null when all its days have passed. */
	next: Date | null;
	/** Its last one-time day (for sorting past ones). */
	last: Date | null;
	/** Entries saved in a form the editor doesn't handle (from the PocketBase dashboard). */
	unreadable: number;
}

/** A record the calendar ignores, or another settings record for a built-in holiday. */
export interface AttentionRow {
	record: CalendarObservance;
	reason: string;
}

export interface OwnGroups {
	/** Days still to come (and every yearly day), soonest first. */
	upcoming: OwnRow[];
	/** One-time days that have all passed, latest first. */
	past: OwnRow[];
	attention: AttentionRow[];
}

/** The entries of a record, as the form shows them. */
export const entriesOf = (record: CalendarObservance, today: Date) =>
	sortEntries(rawDates(record).map((value) => entryFromSaved(value, today)));

/** Its next day from today, or null. */
function nextDay(entries: readonly DayEntry[], today: Date): Date | null {
	const start = startOfDay(today);
	const dates = entries
		.flatMap((entry) => (entry.kind === 'other' ? [] : [dayDate(entry.day)]))
		.filter((date) => date >= start)
		.sort((a, b) => a.getTime() - b.getTime());
	return dates[0] ?? null;
}

/** Splits the records that aren't a built-in holiday's settings into the page's groups. */
export function ownGroups(
	records: readonly CalendarObservance[],
	holidays: readonly BuiltInHoliday[],
	today: Date
): OwnGroups {
	const groups: OwnGroups = { upcoming: [], past: [], attention: [] };
	for (const record of records) {
		if (isSettingsRecord(record)) {
			const holiday = findBuiltIn(holidays, record.name ?? '');
			if (!holiday) {
				groups.attention.push({
					record,
					reason: record.name?.trim()
						? `It has no days, and no built-in holiday is called “${record.name.trim()}”, so the calendar doesn't show it. Add its days, or pick the holiday it should change.`
						: "It has no name and no days, so the calendar doesn't show it."
				});
			} else if (settingsRecordsFor(records, holiday.name)[0]?.id !== record.id) {
				groups.attention.push({
					record,
					reason: `Another set of changes to ${holiday.name} (made outside this editor). The calendar uses both; the newer one wins where they differ. You can delete one of them.`
				});
			}
			continue;
		}
		const entries = entriesOf(record, today);
		const next = nextDay(entries, today);
		const onceDays = entries.flatMap((entry) => (entry.kind === 'once' ? [entry.day] : []));
		const row: OwnRow = {
			record,
			entries,
			next,
			last: onceDays.length ? dayDate(onceDays[onceDays.length - 1]) : null,
			unreadable: entries.filter((entry) => entry.kind === 'other').length
		};
		// A day saved as some other rule may still come: keep it with the days to come. So is a day
		// earlier this month: the month page still shows it (only older ones are offered for cleanup).
		const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
		if (next || row.unreadable > 0 || (row.last && row.last >= thisMonth))
			groups.upcoming.push(row);
		else groups.past.push(row);
	}
	const time = (date: Date | null) => date?.getTime() ?? Infinity;
	groups.upcoming.sort((a, b) => time(a.next) - time(b.next) || compareByName(a.record, b.record));
	groups.past.sort((a, b) => time(b.last) - time(a.last) || compareByName(a.record, b.record));
	groups.attention.sort((a, b) => compareByName(a.record, b.record));
	return groups;
}

/** "Wed, Nov 25, 2026", "Every year on Nov 19", or "8 days, Mon, Dec 21, 2026 to Fri, Jan 1, 2027". */
export function scheduleText(entries: readonly DayEntry[]): string {
	if (entries.length === 0) return 'No days';
	const dated = entries.filter((entry) => entry.kind === 'once');
	if (entries.length > 3 && dated.length === entries.length) {
		const first = dayDate((dated[0] as { day: string }).day);
		const last = dayDate((dated[dated.length - 1] as { day: string }).day);
		return `${plural(entries.length, 'day')}, ${formatDay(first)} to ${formatDay(last)}`;
	}
	if (entries.length > 3)
		return `${entries.slice(0, 2).map(describeEntry).join(' · ')} and ${entries.length - 2} more`;
	return entries.map(describeEntry).join(' · ');
}

/** One day in "Coming up". */
export interface ComingDay {
	date: Date;
	/** As the slide shows them that day. */
	observances: Holiday[];
	/** The slide's badge: no school wins over a short day. */
	school: School;
}

/**
 * The days from today to `days` days ahead with something on the calendar (built-in holidays
 * and the class's own days together), as the slide shows them.
 */
export function comingUp(
	records: readonly CalendarObservance[],
	today: Date,
	iconOf: IconLookup,
	days = COMING_UP_DAYS
): ComingDay[] {
	const start = startOfDay(today);
	const end = addDays(start, days);
	const found: ComingDay[] = [];
	for (
		let month = new Date(start.getFullYear(), start.getMonth(), 1);
		month < end;
		month = new Date(month.getFullYear(), month.getMonth() + 1, 1)
	) {
		const map = observancesForMonth(records, month.getFullYear(), month.getMonth(), iconOf);
		for (const [day, observances] of [...map].sort(([a], [b]) => a - b)) {
			const date = new Date(month.getFullYear(), month.getMonth(), day);
			if (date < start || date >= end) continue;
			const school: School = observances.some((o) => o.school === 'none')
				? 'none'
				: observances.some((o) => o.school === 'short')
					? 'short'
					: 'full';
			found.push({ date, observances, school });
		}
	}
	return found;
}
