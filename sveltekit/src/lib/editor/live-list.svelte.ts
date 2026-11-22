// The records an editor page shows, loaded from PocketBase and kept in step with other windows.
import type { RecordModel, RecordSubscription } from 'pocketbase';
import { watchCollection, type WatchOptions } from '#lib/pb/live.ts';
import { describeError } from './errors.ts';
import { remove, upsert } from './list.ts';

/** How often a failed first load, or failed live updates, are tried again. */
export const RETRY_MS = 5000;

export interface LiveListOptions<T extends RecordModel> {
	/** The collection to follow live (e.g. 'icons'). */
	collection: string;
	/** Loads every record the page shows (pass requestKey: null). */
	load: () => Promise<T[]>;
	/** Completes "Couldn't ..." when the first load fails, e.g. "load the icons". */
	doing: string;
	/** Sent with the live subscription, e.g. `{ expand: 'icon' }`. */
	watch?: WatchOptions;
	/**
	 * Whether a live event's record belongs in the list (default: all). A record that stops
	 * matching is taken out, e.g. `(icon) => icon.for_calendar` for a picker of calendar icons.
	 */
	keep?: (record: T) => boolean;
}

/**
 * Loads a collection and follows it live; what the People page proved, for every editor page.
 *
 * - `status`: 'loading' until the first load is in, then 'ready'; 'error' while the first load
 *   fails (`loadError` says why). It tries again every RETRY_MS by itself; `load()` tries now
 *   (`retrying` is true meanwhile). Once ready, a failed reload keeps the list as it is.
 * - `live`: the realtime connection: show EditorHeader's badge and OfflineNotice when it isn't
 *   'live'. After a dropped connection comes back, everything is loaded again.
 * - Live changes that arrive while a load is on its way are applied on top of its answer.
 * - `items` is replaced, never changed in place (it is not deeply reactive). After a save, put
 *   PocketBase's answer in with `upsert()` (or `remove()` after a delete): the live event for it
 *   may come before or after; both orders end the same.
 *
 * Usage, in a page:
 * ```ts
 * const icons = new LiveList<IconRecord>({ collection: 'icons', load: listIcons, doing: 'load the icons' });
 * onMount(() => icons.start());
 * onDestroy(() => icons.stop());
 * ```
 */
export class LiveList<T extends RecordModel> {
	status: 'loading' | 'ready' | 'error' = $state('loading');
	loadError = $state('');
	retrying = $state(false);
	items: T[] = $state.raw([]);
	live: 'connecting' | 'live' | 'offline' = $state('connecting');

	readonly #options: LiveListOptions<T>;
	#destroyed = false;
	#retryTimer: ReturnType<typeof setTimeout> | undefined;
	#watchRetryTimer: ReturnType<typeof setTimeout> | undefined;
	#stopWatching: (() => Promise<void>) | undefined;
	#watching = false;
	/** Live changes that arrived while a load was on its way, one list per load. */
	readonly #changesDuringLoads: RecordSubscription<T>[][] = [];

	constructor(options: LiveListOptions<T>) {
		this.#options = options;
	}

	/** Starts loading (call it in onMount). */
	start() {
		this.load();
	}

	/** Stops following and any retries (call it in onDestroy). */
	stop() {
		this.#destroyed = true;
		clearTimeout(this.#retryTimer);
		clearTimeout(this.#watchRetryTimer);
		this.#stopWatching?.();
	}

	/** The record with this id, if the list has it. */
	find(id: string): T | undefined {
		return this.items.find((item) => item.id === id);
	}

	/** Puts a saved record in (or replaces it); one that `keep` refuses is taken out. */
	upsert(record: T) {
		const { keep } = this.#options;
		this.items = !keep || keep(record) ? upsert(this.items, record) : remove(this.items, record.id);
	}

	/** Takes a record out (after a delete). */
	remove(id: string) {
		this.items = remove(this.items, id);
	}

	#apply = (list: T[], event: RecordSubscription<T>): T[] => {
		const { keep } = this.#options;
		return event.action === 'delete' || (keep && !keep(event.record))
			? remove(list, event.record.id)
			: upsert(list, event.record);
	};

	/** (Re)loads everything. A failure only replaces the list with an error before the first load. */
	load = async () => {
		clearTimeout(this.#retryTimer);
		if (this.status === 'error') this.retrying = true;
		const changes: RecordSubscription<T>[] = [];
		this.#changesDuringLoads.push(changes);
		try {
			const list = await this.#options.load();
			if (this.#destroyed) return;
			// The answer may have been put together before those changes: apply them again on top.
			this.items = changes.reduce(this.#apply, list);
			this.status = 'ready';
			this.loadError = '';
			this.#startWatching();
		} catch (error) {
			if (this.#destroyed || this.status === 'ready') return;
			console.error(`Could not load ${this.#options.collection}`, error);
			this.loadError = describeError(error, this.#options.doing).message;
			this.status = 'error';
			this.#retryTimer = setTimeout(this.load, RETRY_MS);
		} finally {
			this.#changesDuringLoads.splice(this.#changesDuringLoads.indexOf(changes), 1);
			this.retrying = false;
		}
	};

	#startWatching() {
		if (this.#watching || this.#destroyed) return;
		this.#watching = true;
		watchCollection<T>(
			this.#options.collection,
			{
				onChange: (event) => {
					for (const changes of this.#changesDuringLoads) changes.push(event);
					this.items = this.#apply(this.items, event);
				},
				onConnect: () => {
					const missedChanges = this.live === 'offline';
					this.live = 'live';
					if (missedChanges) this.load();
				},
				onDisconnect: () => {
					this.live = 'offline';
				}
			},
			this.#options.watch
		).then(
			(stop) => {
				if (this.#destroyed) {
					stop();
					return;
				}
				this.#stopWatching = stop;
				this.live = 'live';
				this.load(); // catch anything that changed between the first load and subscribing
			},
			(error) => {
				console.error('Could not start live updates', error);
				this.#watching = false;
				this.live = 'offline';
				this.#watchRetryTimer = setTimeout(() => this.#startWatching(), RETRY_MS);
			}
		);
	}
}
