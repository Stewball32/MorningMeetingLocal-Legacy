// PocketBase access for the people editor (/people): list, create, update and delete people,
// count the history deleted with them, and follow changes live.
//
// Every request passes requestKey: null: the SDK otherwise cancels a pending request when another
// one with the same key starts (e.g. two quick Active toggles, or a reload during a save).
//
// Saves and deletes also give up after WRITE_TIMEOUT_MS: the SDK has no timeout of its own, and the
// dialogs stay locked while a save or delete is on its way, so a request that never gets an
// answer (e.g. the laptop's Wi-Fi dropped) must end as a "Can't reach PocketBase" error.
import { PUBLIC_POCKETBASE_URL } from '$app/env/public';
import type { RecordSubscription, UnsubscribeFunc } from 'pocketbase';
import { getPbImageUrl, pb } from '#lib/pb/index.ts';
import type { Person } from '#lib/pb/types.ts';
import type { PersonFields } from '#lib/people/form.ts';
import { DEFAULT_AVATAR } from '#lib/people/people.ts';

export const PEOPLE = 'people';
export const PEOPLE_DAILIES = 'people_dailies';
export const GUEST_DAILIES = 'guest_dailies';
export const POCKETBASE_URL = PUBLIC_POCKETBASE_URL;

/** Long enough for a 5 MB picture on slow Wi-Fi. */
export const WRITE_TIMEOUT_MS = 30_000;
const writeOptions = () => ({ requestKey: null, signal: AbortSignal.timeout(WRITE_TIMEOUT_MS) });

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
		.create<Person>(withAvatar(fields, avatar ?? undefined), writeOptions());
}

export function updatePerson(
	id: string,
	fields: Partial<PersonFields>,
	avatar?: AvatarChange
): Promise<Person> {
	return pb.collection(PEOPLE).update<Person>(id, withAvatar(fields, avatar), writeOptions());
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

async function countLinked(collection: string, id: string): Promise<number> {
	const page = await pb.collection(collection).getList(1, 1, {
		filter: pb.filter('person = {:id}', { id }),
		fields: 'id',
		requestKey: null
	});
	return page.totalItems;
}

/** Counts the history deleted with the person. */
export async function countPersonHistory(id: string): Promise<PersonHistory> {
	const [days, guestCheckIns] = await Promise.all([
		countLinked(PEOPLE_DAILIES, id),
		countLinked(GUEST_DAILIES, id)
	]);
	return { days, guestCheckIns };
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
	/**
	 * subscribe() adds its listener before it connects and leaves it there when connecting fails;
	 * that leftover would keep the realtime connection open (and call this watch) after the page
	 * is gone. The SDK hands out no way to remove it, so take it from its list for the topic: it
	 * is the last one right after subscribe() is called (it is added before the first await).
	 */
	const subscribe = async (topic: string, start: () => Promise<UnsubscribeFunc>) => {
		const subscribing = start();
		const listeners = (realtime as unknown as { subscriptions?: Record<string, EventListener[]> })
			.subscriptions?.[topic];
		const listener = listeners?.[listeners.length - 1];
		try {
			unsubscribers.push(await subscribing);
		} catch (error) {
			if (listener) await realtime.unsubscribeByTopicAndListener(topic, listener).catch(() => {});
			throw error;
		}
	};
	try {
		await subscribe('PB_CONNECT', () => realtime.subscribe('PB_CONNECT', () => watch.onConnect()));
		await subscribe(`${PEOPLE}/*`, () =>
			pb.collection(PEOPLE).subscribe<Person>('*', (event) => watch.onChange(event))
		);
	} catch (error) {
		await stop();
		throw error;
	}
	return stop;
}
