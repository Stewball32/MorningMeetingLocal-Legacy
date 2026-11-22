// Who the slides show, worked out from the `people` collection.
//
// - active = false hides a person everywhere on the slides (their history is kept).
// - is_guest = true people are only offered in the Add Guest list, never on the student or
//   teacher attendance pages.

import { getPbImageUrl } from '#lib/pb/index.ts';
import type { GuestDaily, IconRecord, Person } from '#lib/pb/types.ts';
import { displayName } from '#lib/people/people.ts';

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

/**
 * Today's check-ins without those of people who are no longer regular guests: switched off (not
 * active), or switched to Guest off (then they are a student or teacher again and counted as one).
 */
export const visibleGuestDailies = (guestDailies: GuestDaily[], peopleById: Map<string, Person>) =>
	guestDailies.filter((guest) => {
		const person = guestPerson(guest, peopleById);
		return !person || isListedGuest(person);
	});

/**
 * The name a guest check-in shows: a regular guest's current name with their title (like the
 * teacher page), or the name saved at check-in when it is a one-off guest or the person is gone.
 */
export const guestDisplayName = (guest: GuestDaily, person: Person | undefined) =>
	person ? displayName(person) : guest.name;

/** The regular guests (people) among today's check-ins. */
export const checkedInPeople = (guestDailies: GuestDaily[]) =>
	new Set(guestDailies.flatMap((guest) => (guest.person ? [guest.person] : [])));

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
 * The names offered in the Add Guest dialog: the regular guests (active is_guest people, by their
 * display name) first, then the earlier one-off guests, each name once. Regular guests already
 * checked in today are left out (they can check in once a day). Earlier check-ins of a regular
 * guest are left out too (the person is listed instead), and so are those of people who are no
 * longer active.
 */
export const guestNameOptions = (
	guestPeople: Person[],
	previousGuests: GuestDaily[],
	peopleById: Map<string, Person>,
	guestAvatarMap: Map<string, IconRecord>,
	checkedInToday: ReadonlySet<string> = new Set()
): GuestNameOption[] => {
	const regularGuests = guestPeople.map((person) => ({
		label: displayName(person),
		value: PERSON_OPTION_PREFIX + person.id,
		emoji: '👤',
		person
	}));
	// a checked-in regular guest's name isn't offered again as a one-off guest either
	const names = new Set(regularGuests.map((option) => option.label));
	const options: GuestNameOption[] = regularGuests.filter(
		(option) => !checkedInToday.has(option.person.id)
	);
	const listedPeople = new Set(guestPeople.map((person) => person.id));
	for (const guestDaily of previousGuests) {
		const person = guestPerson(guestDaily, peopleById);
		if (person && (!person.active || listedPeople.has(person.id))) continue;
		if (names.has(guestDaily.name)) continue;
		names.add(guestDaily.name);
		options.push({
			label: guestDaily.name,
			value: guestDaily.id,
			emoji: guestAvatarMap.get(guestDaily.avatar)?.emoji || '❔'
		});
	}
	return options;
};

export interface GuestIconOption {
	label: string;
	value: string;
	emoji: string;
}

/** Icons switched on for guests (the `for_guests` field). */
export const isGuestIcon = (icon: IconRecord) =>
	(icon as IconRecord & { for_guests?: boolean }).for_guests === true;

/**
 * The icons offered in the Add Guest dialog: those for guests, by name (in PocketBase's order,
 * like the people), from the presenter's live map of every icon.
 */
export const guestIconOptions = (icons: ReadonlyMap<string, IconRecord>): GuestIconOption[] =>
	[...icons.values()]
		.filter(isGuestIcon)
		.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1))
		.map((icon) => ({ label: icon.name, value: icon.id, emoji: icon.emoji }));

/**
 * Why a regular guest picked in the Add Guest dialog can't be checked in (anymore), or undefined
 * if they can. `current` is the person as the slides know them now (undefined once deleted): the
 * People page may have changed them since they were picked.
 */
export const regularGuestProblem = (
	picked: Person,
	current: Person | undefined,
	checkedInToday: ReadonlySet<string>
): string | undefined => {
	const name = displayName(current ?? picked);
	if (!current) return `${name} was deleted on the People page, so they can't be checked in.`;
	if (!current.active)
		return `${name} is switched off (not Active) on the People page, so they can't be checked in.`;
	if (!current.is_guest)
		return `${name} is no longer a guest (Guest is off on the People page), so they can't be checked in as one.`;
	if (checkedInToday.has(current.id)) return `${name} is already checked in today.`;
	return undefined;
};

type FieldErrors = Record<string, { code?: string } | undefined>;

/**
 * PocketBase's per-field errors from a failed request: from a ClientResponseError, or from an
 * Error that wraps one as its cause (as createGuestDaily throws).
 */
const fieldErrors = (error: unknown): FieldErrors => {
	for (const candidate of [error, (error as { cause?: unknown } | null)?.cause]) {
		const data = (candidate as { response?: { data?: unknown } } | null)?.response?.data;
		if (data && typeof data === 'object') return data as FieldErrors;
	}
	return {};
};

/** What to tell the teacher when PocketBase didn't save a guest check-in. */
export const guestCheckInError = (name: string, error: unknown): string => {
	const fields = fieldErrors(error);
	// a unique index: the same regular guest, or the same one-off guest with the same icon
	if (Object.values(fields).some((field) => field?.code === 'validation_not_unique'))
		return `${name} is already checked in today.`;
	if (fields.person?.code === 'validation_missing_rel_records')
		return `${name} was deleted on the People page, so they can't be checked in.`;
	if (fields.avatar?.code === 'validation_missing_rel_records')
		return `The icon picked for ${name} was just deleted on the Icons page. Please pick another one.`;
	return `Couldn't add ${name}. Please try again.`;
};
