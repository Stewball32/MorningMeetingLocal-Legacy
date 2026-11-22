// Who the slides show, worked out from the `people` collection.
//
// - active = false hides a person everywhere on the slides (their history is kept).
// - is_guest = true people are only offered in the Add Guest list, never on the student or
//   teacher attendance pages.

import { getPbImageUrl } from '#lib/pb/index.ts';
import type { GuestDaily, IconRecord, Person } from '#lib/pb/types.ts';

export const DEFAULT_AVATAR = '/defaults/avatar.png';

/** Shown on the student attendance page. */
export const isListedStudent = (person: Person) =>
	person.role === 'student' && !person.is_guest && person.active;

/** Shown on the teacher attendance page. */
export const isListedTeacher = (person: Person) =>
	person.role === 'teacher' && !person.is_guest && person.active;

/** Offered in the Add Guest list. */
export const isListedGuest = (person: Person) => person.is_guest && person.active;

export const studentsOf = (people: Person[]) => people.filter(isListedStudent);
export const teachersOf = (people: Person[]) => people.filter(isListedTeacher);
export const guestPeopleOf = (people: Person[]) => people.filter(isListedGuest);

/** Tells a person apart from a guest check-in (both end up in the "How Many People?" lists). */
export const isPerson = (record: Person | GuestDaily): record is Person =>
	record.collectionName === 'people';

/** The person a guest check-in belongs to, if it was a regular guest who still exists. */
export const guestPerson = (guest: GuestDaily, peopleById: Map<string, Person>) =>
	guest.person ? peopleById.get(guest.person) : undefined;

/** Today's check-ins without those of people who have since been switched off (not active). */
export const visibleGuestDailies = (guestDailies: GuestDaily[], peopleById: Map<string, Person>) =>
	guestDailies.filter((guest) => guestPerson(guest, peopleById)?.active !== false);

/**
 * The picture a guest check-in shows: the person's own picture when it belongs to a person who
 * has one, else the icon picked at check-in, else the default avatar.
 */
export const guestPictureUrl = (
	person: Person | undefined,
	icon: IconRecord | null | undefined
) => {
	if (person?.avatar) return getPbImageUrl(person.collectionId, person.id, person.avatar);
	if (icon) return getPbImageUrl(icon.collectionId, icon.id, icon.image);
	return DEFAULT_AVATAR;
};

// PocketBase sorts `name` with SQLite's default (binary) collation; comparing UTF-16 code units
// gives the same order for everything outside the astral planes.
const byName = (a: Person, b: Person) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * Applies a realtime `people` event to a name-sorted list (like getAllPeople returns) and returns
 * the new list. People with the same name keep their order.
 */
export const applyPersonEvent = (people: Person[], action: string, record: Person): Person[] => {
	if (action === 'delete') return people.filter((person) => person.id !== record.id);
	if (action !== 'create' && action !== 'update') return people;
	const next = people.some((person) => person.id === record.id)
		? people.map((person) => (person.id === record.id ? record : person))
		: [...people, record];
	return next.sort(byName);
};

export interface GuestNameOption {
	label: string;
	value: string;
	emoji: string;
	person?: Person; // set when the option is a regular guest from `people`
}

export const PERSON_OPTION_PREFIX = 'person:';

/**
 * The names offered in the Add Guest dialog: the regular guests (active is_guest people) first,
 * then the earlier one-off guests, each name once. Earlier check-ins of a regular guest are left
 * out (the person is listed instead), and so are those of people who are no longer active.
 */
export const guestNameOptions = (
	guestPeople: Person[],
	previousGuests: GuestDaily[],
	peopleById: Map<string, Person>,
	guestAvatarMap: Map<string, IconRecord>
): GuestNameOption[] => {
	const options: GuestNameOption[] = guestPeople.map((person) => ({
		label: person.name,
		value: PERSON_OPTION_PREFIX + person.id,
		emoji: '👤',
		person
	}));
	const listedPeople = new Set(guestPeople.map((person) => person.id));
	for (const guestDaily of previousGuests) {
		const person = guestPerson(guestDaily, peopleById);
		if (person && (!person.active || listedPeople.has(person.id))) continue;
		if (options.some((option) => option.label === guestDaily.name)) continue;
		options.push({
			label: guestDaily.name,
			value: guestDaily.id,
			emoji: guestAvatarMap.get(guestDaily.avatar)?.emoji || '❔'
		});
	}
	return options;
};
