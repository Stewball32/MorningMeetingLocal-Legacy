// Pure helpers for showing people in the editor the way the slides show them.
import type { Person } from '#lib/pb/types.ts';

/** Shown when a person has no picture (or it fails to load), like the slides. */
export const DEFAULT_AVATAR = '/defaults/avatar.png';

/** "Mr. Smith" for a teacher with a title, otherwise just the name: the same text as PersonButton. */
export function displayName(person: Pick<Person, 'name' | 'title'>): string {
	return `${person.title || ''} ${person.name}`.trimStart();
}

/**
 * The slides list people with PocketBase's `sort: 'name'`, which compares the stored text as is
 * (SQLite's default BINARY collation). Compare the same way so the editor keeps the slides'
 * order, falling back to the id so the order never flickers.
 */
export function compareByName(a: Pick<Person, 'name' | 'id'>, b: Pick<Person, 'name' | 'id'>) {
	if (a.name !== b.name) return a.name < b.name ? -1 : 1;
	if (a.id !== b.id) return a.id < b.id ? -1 : 1;
	return 0;
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

/** Adds the record, or replaces the one with the same id (realtime create/update). */
export function upsertPerson(people: readonly Person[], record: Person): Person[] {
	const index = people.findIndex((person) => person.id === record.id);
	if (index === -1) return [...people, record];
	const next = [...people];
	next[index] = record;
	return next;
}

/** Drops the record with this id (realtime delete). */
export function removePerson(people: readonly Person[], id: string): Person[] {
	return people.filter((person) => person.id !== id);
}

/** "1 day" / "12 days". */
export function plural(count: number, one: string, many = `${one}s`): string {
	return `${count} ${count === 1 ? one : many}`;
}
