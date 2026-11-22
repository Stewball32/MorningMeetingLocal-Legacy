// PocketBase access for the people editor (/people): list, create, update and delete people,
// count their attendance history, and follow changes live.
//
// Every request passes requestKey: null: the SDK otherwise cancels a pending request when another
// one with the same key starts (e.g. two quick Active toggles, or a reload during a save).
import { PUBLIC_POCKETBASE_URL } from '$app/env/public';
import type { RecordSubscription, UnsubscribeFunc } from 'pocketbase';
import { getPbImageUrl, pb } from '#lib/pb/index.ts';
import type { Person } from '#lib/pb/types.ts';
import type { PersonFields } from '#lib/people/form.ts';
import { DEFAULT_AVATAR } from '#lib/people/people.ts';

export const PEOPLE = 'people';
export const PEOPLE_DAILIES = 'people_dailies';
export const POCKETBASE_URL = PUBLIC_POCKETBASE_URL;

/** A new picture to upload, null to remove the current one, undefined to leave it alone. */
export type AvatarChange = File | null | undefined;

const withAvatar = (fields: Partial<PersonFields>, avatar: AvatarChange) =>
	avatar === undefined ? { ...fields } : { ...fields, avatar };

/** Everyone, active or not, sorted by name like the slides. */
export function listPeople(): Promise<Person[]> {
	return pb.collection(PEOPLE).getFullList<Person>({ sort: 'name', requestKey: null });
}

export function createPerson(fields: PersonFields, avatar?: File | null): Promise<Person> {
	return pb
		.collection(PEOPLE)
		.create<Person>(withAvatar(fields, avatar ?? undefined), { requestKey: null });
}

export function updatePerson(
	id: string,
	fields: Partial<PersonFields>,
	avatar?: AvatarChange
): Promise<Person> {
	return pb.collection(PEOPLE).update<Person>(id, withAvatar(fields, avatar), { requestKey: null });
}

/** Permanent. PocketBase also deletes the person's people_dailies (cascade). */
export function deletePerson(id: string): Promise<boolean> {
	return pb.collection(PEOPLE).delete(id, { requestKey: null });
}

/** How many days of attendance history (people_dailies rows) the person has. */
export async function countPersonDailies(id: string): Promise<number> {
	const page = await pb.collection(PEOPLE_DAILIES).getList(1, 1, {
		filter: pb.filter('person = {:id}', { id }),
		fields: 'id',
		requestKey: null
	});
	return page.totalItems;
}

export function personAvatarUrl(person: Pick<Person, 'collectionId' | 'id' | 'avatar'>): string {
	return person.avatar
		? getPbImageUrl(person.collectionId, person.id, person.avatar)
		: DEFAULT_AVATAR;
}

export interface PeopleWatch {
	/** Called for every create, update and delete in the people collection. */
	onChange: (event: RecordSubscription<Person>) => void;
	/** Called each time the live connection is (re)established; changes may have been missed. */
	onConnect: () => void;
	/** Called when the live connection drops (the SDK keeps retrying). */
	onDisconnect: () => void;
}

/**
 * Follows the people collection live. Resolves to a function that stops following; only this
 * watch's own listeners are removed, so other subscriptions on the page keep working.
 */
export async function watchPeople(watch: PeopleWatch): Promise<() => Promise<void>> {
	const realtime = pb.realtime;
	const previousOnDisconnect = realtime.onDisconnect;
	const onDisconnect = (activeSubscriptions: string[]) => {
		previousOnDisconnect?.(activeSubscriptions);
		// An empty list means everything was unsubscribed on purpose, not a dropped connection.
		if (activeSubscriptions.length > 0) watch.onDisconnect();
	};
	realtime.onDisconnect = onDisconnect;

	const unsubscribers: UnsubscribeFunc[] = [];
	const stop = async () => {
		if (realtime.onDisconnect === onDisconnect) realtime.onDisconnect = previousOnDisconnect;
		await Promise.allSettled(unsubscribers.splice(0).map((unsubscribe) => unsubscribe()));
	};
	try {
		unsubscribers.push(await realtime.subscribe('PB_CONNECT', () => watch.onConnect()));
		unsubscribers.push(
			await pb.collection(PEOPLE).subscribe<Person>('*', (event) => watch.onChange(event))
		);
	} catch (error) {
		await stop();
		throw error;
	}
	return stop;
}
