// What the calendar slide's month page shows on each day: the built-in US holidays
// (date-holidays), the class's own observances (`calendar_observances`) and the birthdays of
// active people (#lib/birthdays.ts). The pure part, observancesForMonth(), is shared with the
// Calendar Observances editor and the Home page.
//
// Two kinds of observance record (see CalendarObservance):
// - no dates: settings for the built-in holiday of the same name (the name the calendar shows,
//   picture, school day, notes, or hiding it);
// - with dates: the class's own day(s), 'YYYY-MM-DD' (that year only) or 'MM-DD' (every year).
//   Any other date-holidays rule written in the PocketBase dashboard still works as before.
// Records with is_active = false are ignored, except that a built-in holiday's settings record
// still hides the holiday while `hidden` is on (its name, picture, school day and notes are then
// unused).
//
// Dates: date-holidays' `date` strings ('YYYY-MM-DD hh:mm:ss') are read as local days. Never use
// its `start`: US holidays are computed in New York time.
import { birthdaysForMonth, getBirthdayPeople, type BirthdayPerson } from '#lib/birthdays.ts';
import { ruleHolidays } from '#lib/observances/rules.ts';
import { getPbImageUrl, pb } from '#lib/pb/index.ts';
import { watchCollection, type CollectionWatch } from '#lib/pb/live.ts';
import type { CalendarObservance, IconRecord } from '#lib/pb/types.ts';
import Holidays, { type HolidaysTypes } from 'date-holidays';
import type { RecordModel } from 'pocketbase';

export const OBSERVANCES = 'calendar_observances';
export const ICONS = 'icons';
/** Followed for the birthdays. */
export const PEOPLE = 'people';

export interface Holiday extends HolidaysTypes.Holiday {
	description: string;
	/** Local midnight of the day it is shown on. */
	dateObj: Date;
	/** The picture's URL; '' for the default picture. */
	image: string;
	/**
	 * 'federal' for a built-in holiday, 'local' for the class's own day, 'birthday' for a
	 * person's birthday.
	 */
	local: string;
	school: CalendarObservance['school'];
	/**
	 * Built-in holidays: the holiday's own name (without " (observed)"), also when the calendar
	 * shows it under another name (`display_name`). Settings records are matched by it.
	 */
	holiday?: string;
	/** A built-in public holiday's weekday off when it falls on a weekend. */
	observed?: boolean;
	/** The class's own days: the record's id. */
	recordId?: string;
	/** Birthdays: the person's id. */
	personId?: string;
}

/** The school day an observance marks: 'none' shows "No School!", 'short' "Short Day!". */
export type School = 'none' | 'short' | 'full';

/** Added to a holiday's name on its observed (substitute) weekday. */
export const OBSERVED_SUFFIX = ' (observed)';
/** How date-holidays names a substitute day (English). */
const SUBSTITUTE_SUFFIX = ' (substitute day)';

// date-holidays writes typographic apostrophes ("Valentine’s Day"), while names
// typed into PocketBase usually use a plain ' — treat them as the same name.
export const normalizeHolidayName = (name: string) => name.replace(/[‘’ʼ]/g, "'").trim();

export const isSameHolidayName = (a: string, b: string) =>
	normalizeHolidayName(a) === normalizeHolidayName(b);

/**
 * A built-in holiday's other name (a settings record's `display_name`), trimmed: '' when it is
 * empty or just the holiday's own name ("Valentine’s Day" for Valentine's Day, typed in the
 * dashboard), so it never shows as a second name.
 */
export function otherHolidayName(displayName: string, holiday: string): string {
	const name = displayName.trim();
	return isSameHolidayName(name, holiday) ? '' : name;
}

/** A date-holidays date ('YYYY-MM-DD…') as local midnight of that day. */
export function localDay(date: string): Date {
	const [year, month, day] = date.slice(0, 10).split('-').map(Number);
	return new Date(year, month - 1, day);
}

/** A built-in holiday's own school day: no school on public holidays. */
export const defaultSchool = (type: string): School => (type === 'public' ? 'none' : 'full');

/** One day of a built-in holiday in a year (its own day, or its observed weekday). */
export interface BuiltInDay {
	/** The holiday's name, with plain apostrophes (what settings records are matched by). */
	holiday: string;
	/** As the slide shows it: the name, plus " (observed)" on an observed weekday. */
	name: string;
	type: HolidaysTypes.HolidayType;
	school: School;
	observed: boolean;
	dateObj: Date;
	/** date-holidays' own entry. */
	source: HolidaysTypes.Holiday;
}

let usHolidays: Holidays | undefined;
const builtInCache = new Map<number, readonly BuiltInDay[]>();

/**
 * The built-in (date-holidays US) holidays of a year, in date-holidays' order, including the
 * observed weekday of a public holiday that falls on a weekend (e.g. Fri Nov 10, 2028 for
 * Veterans Day on Saturday). An observed day gets its holiday's school day.
 */
export function builtInDays(year: number): readonly BuiltInDay[] {
	const cached = builtInCache.get(year);
	if (cached) return cached;
	usHolidays ??= new Holidays('US');
	const entries = usHolidays.getHolidays(year);
	const typeOf = new Map(
		entries.filter((h) => !h.substitute).map((h) => [normalizeHolidayName(h.name), h.type])
	);
	const days = entries.map((h): BuiltInDay => {
		const observed = !!h.substitute;
		const holiday = normalizeHolidayName(
			observed && h.name.endsWith(SUBSTITUTE_SUFFIX)
				? h.name.slice(0, -SUBSTITUTE_SUFFIX.length)
				: h.name
		);
		const type = (observed && typeOf.get(holiday)) || h.type;
		return {
			holiday,
			name: observed ? holiday + OBSERVED_SUFFIX : holiday,
			type,
			school: defaultSchool(type),
			observed,
			dateObj: localDay(h.date),
			source: h
		};
	});
	builtInCache.set(year, days);
	return days;
}

/** A built-in holiday the editor offers (every name date-holidays has for the US). */
export interface BuiltInHoliday {
	name: string;
	type: HolidaysTypes.HolidayType;
	school: School;
}

/**
 * Every built-in holiday, from date-holidays (not a list kept here): the names of `years` years
 * from `fromYear`, enough to include the ones that aren't every year (Election Day: every 4).
 */
export function builtInHolidays(fromYear: number, years = 8): BuiltInHoliday[] {
	const found = new Map<string, BuiltInHoliday>();
	for (let year = fromYear; year < fromYear + years; year++) {
		for (const day of builtInDays(year)) {
			if (!day.observed && !found.has(day.holiday))
				found.set(day.holiday, { name: day.holiday, type: day.type, school: day.school });
		}
	}
	return [...found.values()];
}

/** Whether `name` is a built-in holiday's (apostrophes and spaces around it don't count). */
export function findBuiltIn(
	holidays: readonly BuiltInHoliday[],
	name: string
): BuiltInHoliday | undefined {
	return holidays.find((holiday) => isSameHolidayName(holiday.name, name));
}

/**
 * A record's `dates` as a list. PocketBase's json field takes anything: a single date string
 * written in the dashboard counts as one date (the slide used to read it letter by letter).
 */
export function rawDates(record: Pick<CalendarObservance, 'dates'>): unknown[] {
	const dates: unknown = record.dates;
	if (Array.isArray(dates)) return dates;
	if (typeof dates === 'string' && dates.trim()) return [dates];
	return [];
}

/** A record with no dates holds settings for the built-in holiday of the same name. */
export const isSettingsRecord = (record: Pick<CalendarObservance, 'dates'>) =>
	rawDates(record).length === 0;

type FileOwner = Pick<RecordModel, 'collectionId' | 'id'> & { image?: string };

/**
 * The picture an observance shows: its own picture, else its icon's picture, else '' (the
 * slide then shows its default calendar picture).
 */
export function observancePicture(record: FileOwner, icon?: FileOwner | null): string {
	if (record.image) return getPbImageUrl(record.collectionId, record.id, record.image);
	if (icon?.image) return getPbImageUrl(icon.collectionId, icon.id, icon.image);
	return '';
}

/** Finds a record's icon (fetched with `expand: 'icon'` by default). */
export type IconLookup = (record: CalendarObservance) => IconRecord | null | undefined;

const expandedIcon: IconLookup = (record) => {
	const icon = record.expand?.icon;
	return record.icon && icon?.id === record.icon ? icon : undefined;
};

/** Oldest first, so that when two records disagree the newer one wins. */
const byCreated = (a: CalendarObservance, b: CalendarObservance) =>
	a.created === b.created
		? a.id < b.id
			? -1
			: a.id > b.id
				? 1
				: 0
		: a.created < b.created
			? -1
			: 1;

/** What the settings records for one built-in holiday change. */
export interface HolidaySettings {
	/** The name the calendar shows instead of the built-in one; '' for its own. */
	displayName: string;
	description: string;
	school: CalendarObservance['school'];
	image: string;
	hidden: boolean;
}

/**
 * The settings for each built-in holiday (by name), from the active records with no dates.
 * Several records for one holiday (made in the PocketBase dashboard) add up, oldest first: an
 * empty field leaves the value before it alone, and the newest record's `hidden` counts.
 */
export function holidaySettings(
	records: readonly CalendarObservance[],
	iconOf: IconLookup = expandedIcon
): Map<string, HolidaySettings> {
	const settings = new Map<string, HolidaySettings>();
	for (const record of [...records].sort(byCreated)) {
		if (!isSettingsRecord(record)) continue;
		const key = normalizeHolidayName(record.name ?? '');
		const before = settings.get(key);
		// "Use these changes" off: the name, picture, school day and notes don't count, but Hide does
		const used = !!record.is_active;
		settings.set(key, {
			// || not ??: PocketBase gives '' when it was never set.
			displayName:
				(used && otherHolidayName(record.display_name || '', record.name || '')) ||
				before?.displayName ||
				'',
			description: (used && record.description) || before?.description || '',
			school: (used && record.school) || before?.school || '',
			image: (used && observancePicture(record, iconOf(record))) || before?.image || '',
			hidden: !!record.hidden || (!used && !!before?.hidden)
		});
	}
	return settings;
}

/** The days of one of the class's own observance records in a month. */
function ownDays(
	record: CalendarObservance,
	year: number,
	month: number,
	iconOf: IconLookup
): Holiday[] {
	const image = observancePicture(record, iconOf(record));
	// Worked out like the Days editor's next dates (ruleHolidays): no substitute days.
	const rules = rawDates(record).filter((rule): rule is string => typeof rule === 'string');
	return ruleHolidays(rules, year, {
		name: record.name,
		type: 'school',
		description: record.description || '',
		image,
		local: 'local',
		school: record.school || 'full',
		recordId: record.id
	} as HolidaysTypes.HolidayOptions)
		.filter((h) => localDay(h.date).getMonth() === month)
		.map((h) => ({ ...h, dateObj: localDay(h.date) }) as Holiday);
}

/**
 * What the month page shows: day of the month -> the observances that day, built-in holidays
 * first (date-holidays' order), then the class's own (oldest record first), then the birthdays of
 * `people` (none when it is left out). `month` is 0-11. Inactive records and people are ignored,
 * so the editor can pass all of its records.
 */
export function observancesForMonth(
	records: readonly CalendarObservance[],
	year: number,
	month: number,
	iconOf: IconLookup = expandedIcon,
	people: readonly BirthdayPerson[] = []
): Map<number, Holiday[]> {
	const settings = holidaySettings(records, iconOf);
	const holidays: Holiday[] = [];
	for (const day of builtInDays(year)) {
		if (day.dateObj.getMonth() !== month) continue;
		const changes = settings.get(day.holiday);
		if (changes?.hidden) continue;
		holidays.push({
			...day.source,
			// Another name from its settings ("Turkey Day"), with " (observed)" on its weekday off.
			name: changes?.displayName
				? changes.displayName + (day.observed ? OBSERVED_SUFFIX : '')
				: day.name,
			description: changes?.description || '',
			dateObj: new Date(day.dateObj),
			image: changes?.image || '',
			local: 'federal',
			// || and not ??: PocketBase gives '' for a school day that was never set.
			school: changes?.school || day.school,
			holiday: day.holiday,
			observed: day.observed
		});
	}
	for (const record of [...records].sort(byCreated)) {
		if (record.is_active && !isSettingsRecord(record))
			holidays.push(...ownDays(record, year, month, iconOf));
	}
	holidays.push(...birthdaysForMonth(people, year, month));

	const map = new Map<number, Holiday[]>();
	for (const holiday of holidays) {
		const day = holiday.dateObj.getDate();
		if (!map.has(day)) map.set(day, []);
		map.get(day)!.push(holiday);
	}
	return map;
}

/**
 * Every observance record the calendar uses, with its icon (for observancesForMonth): the active
 * ones, and inactive ones that hide a built-in holiday. `signal` can end the request (e.g.
 * AbortSignal.timeout for a page that must not wait forever).
 */
export function getActiveObservances(signal?: AbortSignal): Promise<CalendarObservance[]> {
	return pb.collection(OBSERVANCES).getFullList<CalendarObservance>({
		filter: 'is_active = true || hidden = true',
		expand: 'icon',
		requestKey: null,
		...(signal && { signal })
	});
}

/**
 * What the month page shows in a month (0-11): day of the month -> observances and birthdays.
 * Throws when the observances can't be loaded; without the birthdays (say PocketBase doesn't have
 * the birthday field yet) it still shows the observances.
 */
export async function getHolidayMap(year: number, month: number) {
	const [records, people] = await Promise.all([
		getActiveObservances(),
		getBirthdayPeople().catch((error): BirthdayPerson[] => {
			console.error('Could not load the birthdays', error);
			return [];
		})
	]);
	return observancesForMonth(records, year, month, undefined, people);
}

/** How long to wait for more changes before refetching (deleting an icon sends several). */
export const FOLLOW_DELAY_MS = 300;
/** How often following is tried again while PocketBase can't be reached. */
export const FOLLOW_RETRY_MS = 5000;

/**
 * Calls `onChange` (once for a burst of changes) whenever observances, icons or people (their
 * birthdays) change in PocketBase, or after the live connection came back (changes may have been
 * missed). Returns the function that stops following (call it when the page goes away).
 *
 * Each collection is one more topic on the SDK's single realtime connection (`pb.realtime` keeps
 * one EventSource for the whole page), so following people opens no extra connection.
 */
export function followObservances(onChange: () => void): () => void {
	let stopped = false;
	let changeTimer: ReturnType<typeof setTimeout> | undefined;
	const retryTimers = new Set<ReturnType<typeof setTimeout>>();
	const stops: (() => Promise<void>)[] = [];

	const changed = () => {
		clearTimeout(changeTimer);
		changeTimer = setTimeout(() => {
			if (!stopped) onChange();
		}, FOLLOW_DELAY_MS);
	};

	const follow = (collection: string, missed: boolean) => {
		let offline = false;
		const watch: CollectionWatch<RecordModel> = {
			onChange: changed,
			onConnect: () => {
				if (offline) changed();
				offline = false;
			},
			onDisconnect: () => {
				offline = true;
			}
		};
		watchCollection(collection, watch).then(
			(stop) => {
				if (stopped) {
					stop();
					return;
				}
				stops.push(stop);
				// It failed before: whatever changed meanwhile was missed.
				if (missed) changed();
			},
			(error) => {
				if (stopped) return;
				console.error(`Could not follow ${collection}`, error);
				const timer = setTimeout(() => {
					retryTimers.delete(timer);
					if (!stopped) follow(collection, true);
				}, FOLLOW_RETRY_MS);
				retryTimers.add(timer);
			}
		);
	};
	follow(OBSERVANCES, false);
	follow(ICONS, false);
	follow(PEOPLE, false);

	return () => {
		stopped = true;
		clearTimeout(changeTimer);
		for (const timer of retryTimers) clearTimeout(timer);
		retryTimers.clear();
		for (const stop of stops.splice(0)) stop();
	};
}
