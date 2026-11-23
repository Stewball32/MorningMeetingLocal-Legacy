// The one-line summaries on the Home page's tiles (pure, so they can be tested).
import { plural } from '#lib/editor/list.ts';
import { builtInNameOf } from '#lib/observances/observances.ts';
import type { IconRecord, Person } from '#lib/pb/types.ts';
import { groupOf } from '#lib/people/people.ts';

/** "14 students · 3 teachers · 2 regular guests · 1 inactive" (guests/inactive only if any). */
export function peopleSummary(people: readonly Pick<Person, 'role' | 'is_guest' | 'active'>[]) {
	if (people.length === 0) return 'No people yet';
	const counts = { students: 0, teachers: 0, guests: 0, inactive: 0 };
	for (const person of people) counts[groupOf(person)]++;
	const parts = [plural(counts.students, 'student'), plural(counts.teachers, 'teacher')];
	if (counts.guests > 0) parts.push(plural(counts.guests, 'regular guest'));
	if (counts.inactive > 0) parts.push(`${counts.inactive} inactive`);
	return parts.join(' · ');
}

/** "12 for guests · 1 for the calendar" (an icon with both switches on counts in both). */
export function iconsSummary(icons: readonly Pick<IconRecord, 'for_guests' | 'for_calendar'>[]) {
	if (icons.length === 0) return 'No icons yet';
	const guests = icons.filter((icon) => icon.for_guests).length;
	const calendar = icons.filter((icon) => icon.for_calendar).length;
	return `${guests} for guests · ${calendar} for the calendar`;
}

/** What the calendar slide needs of an observance (the Holiday of #lib/pb/calendar.ts). */
export interface ObservedDay {
	name: string;
	/** Local midnight of its day (date-holidays' date string read as local time). */
	dateObj: Date;
	school: string;
	/** A built-in holiday's own name, also when it is shown under another one. */
	holiday?: string;
	/** A built-in holiday's weekday off. */
	observed?: boolean;
}

export interface UpcomingDay {
	date: Date;
	/**
	 * Every observance that day, in the slide's order; a built-in holiday shown under another
	 * name with its own name after it: "Turkey Day (Thanksgiving Day)".
	 */
	names: string[];
	/** The slide's badge: 'none' (No School!) wins over 'short' (Short Day!); else 'full'. */
	school: 'none' | 'short' | 'full';
}

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/**
 * The next `limit` days (today included) with observances, from what the calendar slide shows
 * (getHolidayMap, flattened), soonest first.
 */
export function upcomingDays(
	observances: readonly ObservedDay[],
	today: Date,
	limit = 3
): UpcomingDay[] {
	const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	const days = new Map<string, UpcomingDay>();
	for (const observance of observances) {
		const date = observance.dateObj;
		if (date < start) continue;
		const key = dayKey(date);
		let day = days.get(key);
		if (!day) {
			day = {
				date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
				names: [],
				school: 'full'
			};
			days.set(key, day);
		}
		const builtInName = builtInNameOf(observance);
		const name = builtInName ? `${observance.name} (${builtInName})` : observance.name;
		if (!day.names.includes(name)) day.names.push(name);
		if (observance.school === 'none') day.school = 'none';
		else if (observance.school === 'short' && day.school !== 'none') day.school = 'short';
	}
	return [...days.values()].sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, limit);
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-US', {
	weekday: 'short',
	month: 'short',
	day: 'numeric'
});

/** "Today", "Tomorrow" or "Thu, Nov 26". */
export function dayLabel(date: Date, today: Date): string {
	const days = Math.round(
		(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
			new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
			86_400_000
	);
	if (days === 0) return 'Today';
	if (days === 1) return 'Tomorrow';
	return DAY_FORMAT.format(date);
}

/** The slide's badge text for a day, or '' for a regular school day. */
export function schoolBadge(school: UpcomingDay['school']): string {
	if (school === 'none') return 'No school';
	if (school === 'short') return 'Short day';
	return '';
}

/** The first days of this month and the next `count - 1` ({ year, month } with month 0-11). */
export function monthsFrom(today: Date, count: number): { year: number; month: number }[] {
	return Array.from({ length: count }, (_, index) => {
		const first = new Date(today.getFullYear(), today.getMonth() + index, 1);
		return { year: first.getFullYear(), month: first.getMonth() };
	});
}
