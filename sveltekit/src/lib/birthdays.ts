// Birthdays on the calendar. A person's `birthday` is 'MM-DD' (no year), or '' for none. The
// calendar slide shows the birthday of every active person who has one (students, teachers and
// regular guests alike: entering a birthday is the opt-in), every year, as "<name>'s Birthday"
// under their picture. A Feb 29 birthday is shown on Feb 28 in a year without Feb 29.
//
// The pure parts are shared by the slide (observancesForMonth in #lib/pb/calendar.ts), the
// People editor (the Birthday field), the Calendar Observances editor (its Birthdays list) and
// the Home page (the next birthday).
import { getPbImageUrl, pb } from '#lib/pb/index.ts';
import type { Holiday } from '#lib/pb/calendar.ts';
import type { Person } from '#lib/pb/types.ts';
import { displayName } from '#lib/people/people.ts';

/** Shown for a birthday when the person has no picture (or it fails to load). */
export const BIRTHDAY_PICTURE = '/defaults/birthday.svg';

/** What the calendar needs of a person (getBirthdayPeople fetches only these fields). */
export type BirthdayPerson = Pick<
	Person,
	'id' | 'collectionId' | 'name' | 'title' | 'avatar' | 'active' | 'birthday'
>;

/** A birthday as numbers: month 1-12, day 1-31. */
export interface MonthDay {
	month: number;
	day: number;
}

export const MONTH_NAMES = [
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

/** How many days a birthday month (1-12) offers: February has 29, for a Feb 29 birthday. */
export function daysInBirthdayMonth(month: number): number {
	// 2000 is a leap year; day 0 of the next month is the last day of this one.
	return new Date(2000, month, 0).getDate();
}

/**
 * A saved birthday as numbers, or null when there is none, or it is not a real day (e.g. '04-31'
 * typed in the PocketBase dashboard, whose pattern lets it through): the calendar skips those.
 */
export function parseBirthday(value: unknown): MonthDay | null {
	if (typeof value !== 'string') return null;
	const match = /^(\d\d)-(\d\d)$/.exec(value.trim());
	if (!match) return null;
	const month = Number(match[1]);
	const day = Number(match[2]);
	if (month < 1 || month > 12 || day < 1 || day > daysInBirthdayMonth(month)) return null;
	return { month, day };
}

/** 'MM-DD' for a month (1-12) and day; '' when either is missing or it isn't a real day. */
export function birthdayValue(month: number, day: number): string {
	const value = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
	return parseBirthday(value) ? value : '';
}

/** Local midnight of the birthday in `year`: Feb 29 is Feb 28 when the year has no Feb 29. */
export function birthdayInYear({ month, day }: MonthDay, year: number): Date {
	const last = new Date(year, month, 0).getDate();
	return new Date(year, month - 1, Math.min(day, last));
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** The birthday's next day from `today` (today included). */
export function nextBirthday(birthday: MonthDay, today: Date): Date {
	const start = startOfDay(today);
	const thisYear = birthdayInYear(birthday, start.getFullYear());
	return thisYear >= start ? thisYear : birthdayInYear(birthday, start.getFullYear() + 1);
}

/** Whole days from `today` to `date` (both local days). */
export function daysUntil(date: Date, today: Date): number {
	// Math.round: a day with a daylight saving change is 23 or 25 hours long.
	return Math.round((startOfDay(date).getTime() - startOfDay(today).getTime()) / 86_400_000);
}

/** "today", "tomorrow" or "in 8 days". */
export function daysUntilText(days: number): string {
	if (days === 0) return 'today';
	if (days === 1) return 'tomorrow';
	return `in ${days} days`;
}

const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/** "Nov 30" for a saved birthday; '' when there is none (or it isn't a real day). */
export function formatBirthday(value: unknown): string {
	const birthday = parseBirthday(value);
	// 2000 is a leap year, so Feb 29 stays Feb 29.
	return birthday ? MONTH_DAY.format(new Date(2000, birthday.month - 1, birthday.day)) : '';
}

/** "Bluey's Birthday", "Mr. Smith's Birthday": the name as the slides show it. */
export function birthdayName(person: Pick<Person, 'name' | 'title'>): string {
	return `${displayName(person)}'s Birthday`;
}

/** The person's picture, else the birthday cake. */
export function birthdayPicture(person: Pick<Person, 'collectionId' | 'id' | 'avatar'>): string {
	return person.avatar
		? getPbImageUrl(person.collectionId, person.id, person.avatar)
		: BIRTHDAY_PICTURE;
}

/** Whether the calendar shows the person's birthday: active, with a real day saved. */
export const showsBirthday = (person: Pick<Person, 'active' | 'birthday'>) =>
	!!person.active && !!parseBirthday(person.birthday);

// PocketBase sorts `name` as stored (SQLite's binary collation); the same order, then the id.
const byName = (a: BirthdayPerson, b: BirthdayPerson) =>
	a.name !== b.name ? (a.name < b.name ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

const dayString = (date: Date) =>
	[
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0')
	].join('-');

/**
 * The birthdays in a month (0-11) as the calendar shows them (like a date-holidays day), by
 * day, then by name. Inactive people and those with no birthday are left out.
 */
export function birthdaysForMonth(
	people: readonly BirthdayPerson[],
	year: number,
	month: number
): Holiday[] {
	const found: Holiday[] = [];
	for (const person of [...people].sort(byName)) {
		const birthday = showsBirthday(person) ? parseBirthday(person.birthday) : null;
		if (!birthday || birthday.month !== month + 1) continue;
		const dateObj = birthdayInYear(birthday, year);
		found.push({
			date: `${dayString(dateObj)} 00:00:00`,
			start: dateObj,
			end: new Date(year, month, dateObj.getDate() + 1),
			name: birthdayName(person),
			type: 'observance',
			rule: person.birthday ?? '',
			description: '',
			dateObj,
			image: birthdayPicture(person),
			local: 'birthday',
			school: 'full',
			personId: person.id
		});
	}
	return found.sort((a, b) => a.dateObj.getDate() - b.dateObj.getDate());
}

/** A birthday in the Calendar Observances editor's list. */
export interface ComingBirthday {
	person: BirthdayPerson;
	/** Its next day (today included). */
	date: Date;
	/** Days from today: 0 is today. */
	days: number;
}

/** Every birthday the calendar shows, by its next day (today first), then by name. */
export function upcomingBirthdays(
	people: readonly BirthdayPerson[],
	today: Date
): ComingBirthday[] {
	return [...people]
		.sort(byName)
		.flatMap((person) => {
			const birthday = showsBirthday(person) ? parseBirthday(person.birthday) : null;
			if (!birthday) return [];
			const date = nextBirthday(birthday, today);
			return [{ person, date, days: daysUntil(date, today) }];
		})
		.sort((a, b) => a.days - b.days);
}

/** Only what the calendar uses (see BirthdayPerson); `collectionName` for the realtime events. */
const BIRTHDAY_FIELDS = 'id,collectionId,collectionName,name,title,avatar,active,birthday';

/**
 * The active people with a birthday, sorted by name. `signal` can end the request (e.g.
 * AbortSignal.timeout). Throws when PocketBase can't be reached, or doesn't have the birthday
 * field yet (the migration wasn't run).
 */
export function getBirthdayPeople(signal?: AbortSignal): Promise<Person[]> {
	return pb.collection('people').getFullList<Person>({
		filter: "active = true && birthday != ''",
		fields: BIRTHDAY_FIELDS,
		sort: 'name',
		requestKey: null,
		...(signal && { signal })
	});
}
