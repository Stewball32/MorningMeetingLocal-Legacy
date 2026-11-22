// Pure helpers for showing people in the editor the way the slides show them.
import type { DescribeOptions } from '#lib/editor/errors.ts';
import { compareByName, plural } from '#lib/editor/list.ts';
import type { Person } from '#lib/pb/types.ts';

/** Shown when a person has no picture (or it fails to load), like the slides. */
export const DEFAULT_AVATAR = '/defaults/avatar.png';

/** For describeError: "this person no longer exists. They may have been deleted ..." */
export const PERSON_ERRORS = { noun: 'person', pronoun: 'They' } satisfies DescribeOptions;

/** "Mr. Smith" for a teacher with a title, otherwise just the name: the same text as PersonButton. */
export function displayName(person: Pick<Person, 'name' | 'title'>): string {
	return `${person.title || ''} ${person.name}`.trimStart();
}

/** The two switches each person has in the list. */
export type Flag = 'active' | 'is_guest';

export type GroupKey = 'teachers' | 'students' | 'guests' | 'inactive';
export type PeopleGroups = Record<GroupKey, Person[]>;

/**
 * Where a person shows up on the slides:
 * - inactive (active = false): nowhere, whatever their other settings;
 * - guests (is_guest): only in the Add Guest list on the guest page;
 * - otherwise on the teacher or student attendance page, by role.
 */
export function groupOf(person: Pick<Person, 'role' | 'is_guest' | 'active'>): GroupKey {
	if (!person.active) return 'inactive';
	if (person.is_guest) return 'guests';
	return person.role === 'teacher' ? 'teachers' : 'students';
}

/** Splits people into the editor's groups, each sorted like the slides. */
export function groupPeople(people: readonly Person[]): PeopleGroups {
	const groups: PeopleGroups = { teachers: [], students: [], guests: [], inactive: [] };
	for (const person of people) groups[groupOf(person)].push(person);
	for (const list of Object.values(groups)) list.sort(compareByName);
	return groups;
}

/** How the slides refer to the person (they fall back to "they" when no pronoun is set). */
export function pronounLabel(pronoun: Person['pronoun']): string {
	if (pronoun === 'he') return 'he / him';
	if (pronoun === 'she') return 'she / her';
	return 'they (not set)';
}

export function roleLabel(role: Person['role']): string {
	return role === 'teacher' ? 'Teacher' : 'Student';
}

/**
 * The history deleted with a person, in words: ["12 days of attendance history",
 * "3 guest check-ins"], leaving out what they have none of.
 */
export function historyParts(history: { days: number; guestCheckIns: number }): string[] {
	const parts: string[] = [];
	if (history.days > 0) parts.push(`${plural(history.days, 'day')} of attendance history`);
	if (history.guestCheckIns > 0) parts.push(plural(history.guestCheckIns, 'guest check-in'));
	return parts;
}

/** The message after one of a person's switches in the list was saved. */
export function flagMessage(
	person: Pick<Person, 'name' | 'title' | 'role' | 'is_guest' | 'active'>,
	flag: Flag
): string {
	const name = displayName(person);
	if (flag === 'active')
		return person.active
			? `${name} is active again and back on the slides.`
			: `${name} is now inactive: hidden from the slides, history kept.`;
	if (person.is_guest)
		return person.active
			? `${name} is now a guest: only offered in the guest list.`
			: `${name} is now a guest, but inactive: the guest list only offers them once Active is turned back on.`;
	return person.active
		? `${name} is no longer a guest and is back on the ${person.role} attendance page.`
		: `${name} is no longer a guest.`;
}
