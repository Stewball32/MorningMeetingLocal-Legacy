// PocketBase access for the people editor (/people): list, create, update and delete people, and
// count the history deleted with them. The page follows changes live through LiveList
// (#lib/editor/live-list.svelte.ts); the request options are explained in requests.ts.
import { pb } from '#lib/pb/index.ts';
import {
	countRecords,
	recordFileUrl,
	withFile,
	writeOptions,
	type FileChange
} from './requests.ts';
import type { Person } from '#lib/pb/types.ts';
import type { PersonFields } from '#lib/people/form.ts';
import { DEFAULT_AVATAR } from '#lib/people/people.ts';

export const PEOPLE = 'people';
export const PEOPLE_DAILIES = 'people_dailies';
export const GUEST_DAILIES = 'guest_dailies';

/** A new picture to upload, null to remove the current one, undefined to leave it alone. */
export type AvatarChange = FileChange;

/** Everyone, active or not, sorted by name like the slides. */
export function listPeople(): Promise<Person[]> {
	return pb.collection(PEOPLE).getFullList<Person>({ sort: 'name', requestKey: null });
}

export function createPerson(fields: PersonFields, avatar?: File | null): Promise<Person> {
	return pb
		.collection(PEOPLE)
		.create<Person>(withFile(fields, 'avatar', avatar ?? undefined), writeOptions());
}

export function updatePerson(
	id: string,
	fields: Partial<PersonFields>,
	avatar?: AvatarChange
): Promise<Person> {
	return pb
		.collection(PEOPLE)
		.update<Person>(id, withFile(fields, 'avatar', avatar), writeOptions());
}

/**
 * Permanent. PocketBase also deletes the person's attendance history (people_dailies) and their
 * guest check-ins (guest_dailies linked to them): both relations cascade.
 */
export function deletePerson(id: string): Promise<boolean> {
	return pb.collection(PEOPLE).delete(id, writeOptions());
}

/** What deleting a person takes with them. */
export interface PersonHistory {
	/** days of attendance (people_dailies rows) */
	days: number;
	/** guest check-ins (guest_dailies rows linked to them) */
	guestCheckIns: number;
}

/** Counts the history deleted with the person. */
export async function countPersonHistory(id: string): Promise<PersonHistory> {
	const filter = pb.filter('person = {:id}', { id });
	const [days, guestCheckIns] = await Promise.all([
		countRecords(PEOPLE_DAILIES, filter),
		countRecords(GUEST_DAILIES, filter)
	]);
	return { days, guestCheckIns };
}

export function personAvatarUrl(person: Pick<Person, 'collectionId' | 'id' | 'avatar'>): string {
	return recordFileUrl(person, person.avatar) || DEFAULT_AVATAR;
}
