// Following a collection live (PocketBase realtime), for the editor pages. Most pages use it
// through LiveList (#lib/editor/live-list.svelte.ts), which also loads the records.
import type { RecordModel, RecordSubscription, UnsubscribeFunc } from 'pocketbase';
import { pb } from '#lib/pb/index.ts';

export interface CollectionWatch<T extends RecordModel> {
	/** Called for every create, update and delete in the collection. */
	onChange: (event: RecordSubscription<T>) => void;
	/** Called each time the live connection is (re)established; changes may have been missed. */
	onConnect: () => void;
	/** Called when the live connection drops (the SDK keeps retrying). */
	onDisconnect: () => void;
}

/** Sent with the subscription, e.g. `{ expand: 'icon' }` to get expanded records in the events. */
export interface WatchOptions {
	expand?: string;
	fields?: string;
	filter?: string;
}

type Listeners = Record<string, EventListener[]>;

/**
 * Follows `collection` live. Resolves to a function that stops following once the subscription
 * is in place; rejects (having cleaned up) when it couldn't be set up, e.g. PocketBase is down.
 *
 * Only this watch's own listeners are removed when it stops, so other subscriptions on the page
 * keep working, and several watches may run at once (e.g. observances and icons on one page).
 * Each chains itself onto `pb.realtime.onDisconnect` and passes the call on to the one before.
 */
export async function watchCollection<T extends RecordModel>(
	collection: string,
	watch: CollectionWatch<T>,
	options?: WatchOptions
): Promise<() => Promise<void>> {
	const realtime = pb.realtime;
	let stopped = false;
	const previousOnDisconnect = realtime.onDisconnect;
	const onDisconnect = (activeSubscriptions: string[]) => {
		previousOnDisconnect?.(activeSubscriptions);
		// An empty list means everything was unsubscribed on purpose, not a dropped connection.
		if (!stopped && activeSubscriptions.length > 0) watch.onDisconnect();
	};
	realtime.onDisconnect = onDisconnect;

	const unsubscribers: UnsubscribeFunc[] = [];
	const stop = async () => {
		stopped = true;
		// A watch started later may have chained itself on top: then this one stays in the chain,
		// only passing the call on.
		if (realtime.onDisconnect === onDisconnect) realtime.onDisconnect = previousOnDisconnect;
		await Promise.allSettled(unsubscribers.splice(0).map((unsubscribe) => unsubscribe()));
	};

	/**
	 * subscribe() adds its listener before it connects and leaves it there when connecting fails;
	 * that leftover would keep the realtime connection open (and call this watch) after the page
	 * is gone. The SDK hands out no way to remove it, so spot it in the SDK's lists: it is the
	 * listener that is new right after subscribe() is called (it is added before the first await).
	 */
	const listeners = () =>
		(realtime as unknown as { subscriptions?: Listeners }).subscriptions ?? ({} as Listeners);
	const subscribe = async (start: () => Promise<UnsubscribeFunc>) => {
		const before = new Map(Object.entries(listeners()).map(([key, list]) => [key, [...list]]));
		const subscribing = start();
		let added: [string, EventListener] | undefined;
		for (const [key, list] of Object.entries(listeners())) {
			const fresh = list.find((listener) => !before.get(key)?.includes(listener));
			if (fresh) added = [key, fresh];
		}
		try {
			unsubscribers.push(await subscribing);
		} catch (error) {
			if (added) await realtime.unsubscribeByTopicAndListener(added[0], added[1]).catch(() => {});
			throw error;
		}
	};
	try {
		await subscribe(() => realtime.subscribe('PB_CONNECT', () => watch.onConnect()));
		await subscribe(() =>
			pb.collection(collection).subscribe<T>('*', (event) => watch.onChange(event), options)
		);
	} catch (error) {
		await stop();
		throw error;
	}
	return stop;
}
