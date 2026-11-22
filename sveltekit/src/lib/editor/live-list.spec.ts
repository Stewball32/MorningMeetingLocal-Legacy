import { ClientResponseError, type RecordModel, type RecordSubscription } from 'pocketbase';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionWatch } from '#lib/pb/live.ts';

// The live connection is faked: each watch is kept so a test can send it events.
const watches: { collection: string; watch: CollectionWatch<RecordModel>; stop: () => void }[] = [];
let watchFails = false;
vi.mock('#lib/pb/live.ts', () => ({
	watchCollection: vi.fn(async (collection: string, watch: CollectionWatch<RecordModel>) => {
		if (watchFails) throw new ClientResponseError({ status: 0 });
		const stop = vi.fn(async () => {});
		watches.push({ collection, watch, stop });
		return stop;
	})
}));

const { LiveList, RETRY_MS } = await import('./live-list.svelte.ts');

interface Item extends RecordModel {
	name: string;
	on?: boolean;
}
const item = (id: string, name = id, on = true): Item => ({
	id,
	name,
	on,
	collectionId: 'c',
	collectionName: 'items'
});
const event = (action: string, record: Item): RecordSubscription<Item> => ({ action, record });
const names = (list: { items: Item[] }) => list.items.map((i) => i.name).sort();

/** A load whose answer the test gives. */
function controlledLoads() {
	const pending: { resolve: (items: Item[]) => void; reject: (error: unknown) => void }[] = [];
	const load = vi.fn(
		() => new Promise<Item[]>((resolve, reject) => pending.push({ resolve, reject }))
	);
	return { load, pending };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
	watches.length = 0;
	watchFails = false;
});
afterEach(() => {
	vi.useRealTimers();
});

describe('LiveList', () => {
	it('loads, starts following, and loads again once following', async () => {
		const { load, pending } = controlledLoads();
		const list = new LiveList<Item>({ collection: 'items', load, doing: 'load the items' });
		expect(list.status).toBe('loading');
		list.start();
		pending[0].resolve([item('a'), item('b')]);
		await flush();
		expect(list.status).toBe('ready');
		expect(names(list)).toEqual(['a', 'b']);
		expect(watches).toHaveLength(1);
		expect(list.live).toBe('live');
		// Anything that changed between the first load and subscribing.
		expect(load).toHaveBeenCalledTimes(2);
		pending[1].resolve([item('a'), item('b'), item('c')]);
		await flush();
		expect(names(list)).toEqual(['a', 'b', 'c']);
		list.stop();
		expect(watches[0].stop).toHaveBeenCalled();
	});

	it('applies changes that arrive during a load on top of its answer', async () => {
		const { load, pending } = controlledLoads();
		const list = new LiveList<Item>({ collection: 'items', load, doing: 'load the items' });
		list.start();
		pending[0].resolve([item('a'), item('b')]);
		await flush();
		// The reload after subscribing is on its way; meanwhile b is deleted and d created.
		const { watch } = watches[0];
		watch.onChange(event('delete', item('b')));
		watch.onChange(event('create', item('d')));
		expect(names(list)).toEqual(['a', 'd']);
		// The answer was put together before those changes.
		pending[1].resolve([item('a'), item('b')]);
		await flush();
		expect(names(list)).toEqual(['a', 'd']);
	});

	it('shows an error while the first load fails, and tries again by itself', async () => {
		vi.useFakeTimers();
		const { load, pending } = controlledLoads();
		const list = new LiveList<Item>({ collection: 'items', load, doing: 'load the items' });
		list.start();
		pending[0].reject(new ClientResponseError({ status: 0 }));
		await vi.advanceTimersByTimeAsync(0);
		expect(list.status).toBe('error');
		expect(list.loadError).toMatch(/^Couldn't load the items\. Can't reach PocketBase/);
		expect(watches).toHaveLength(0);

		await vi.advanceTimersByTimeAsync(RETRY_MS);
		expect(load).toHaveBeenCalledTimes(2);
		pending[1].resolve([item('a')]);
		await vi.advanceTimersByTimeAsync(0);
		expect(list.status).toBe('ready');
		expect(list.loadError).toBe('');
		list.stop();
	});

	it('keeps the list when a later reload fails', async () => {
		const { load, pending } = controlledLoads();
		const list = new LiveList<Item>({ collection: 'items', load, doing: 'load the items' });
		list.start();
		pending[0].resolve([item('a')]);
		await flush();
		pending[1].reject(new ClientResponseError({ status: 0 }));
		await flush();
		expect(list.status).toBe('ready');
		expect(names(list)).toEqual(['a']);
	});

	it('goes offline when the connection drops, and reloads when it is back', async () => {
		const { load, pending } = controlledLoads();
		const list = new LiveList<Item>({ collection: 'items', load, doing: 'load the items' });
		list.start();
		pending[0].resolve([item('a')]);
		await flush();
		pending[1].resolve([item('a')]);
		await flush();
		const { watch } = watches[0];
		watch.onDisconnect();
		expect(list.live).toBe('offline');
		watch.onConnect();
		expect(list.live).toBe('live');
		expect(load).toHaveBeenCalledTimes(3);
		pending[2].resolve([item('a'), item('missed')]);
		await flush();
		expect(names(list)).toEqual(['a', 'missed']);
		// A (re)connect without a drop before it loads nothing.
		watch.onConnect();
		expect(load).toHaveBeenCalledTimes(3);
	});

	it('tries live updates again when they could not be started', async () => {
		vi.useFakeTimers();
		watchFails = true;
		const { load, pending } = controlledLoads();
		const list = new LiveList<Item>({ collection: 'items', load, doing: 'load the items' });
		list.start();
		pending[0].resolve([item('a')]);
		await vi.advanceTimersByTimeAsync(0);
		expect(list.status).toBe('ready');
		expect(list.live).toBe('offline');
		watchFails = false;
		await vi.advanceTimersByTimeAsync(RETRY_MS);
		expect(watches).toHaveLength(1);
		expect(list.live).toBe('live');
		list.stop();
	});

	it('only keeps the records `keep` accepts', async () => {
		const { load, pending } = controlledLoads();
		const list = new LiveList<Item>({
			collection: 'items',
			load,
			doing: 'load the items',
			keep: (record) => !!record.on
		});
		list.start();
		pending[0].resolve([item('a'), item('b')]);
		await flush();
		watches[0].watch.onChange(event('update', item('a', 'a', false)));
		watches[0].watch.onChange(event('create', item('off', 'off', false)));
		expect(names(list)).toEqual(['b']);
		list.upsert(item('b', 'b', false));
		expect(names(list)).toEqual([]);
		list.upsert(item('c'));
		expect(names(list)).toEqual(['c']);
		list.remove('c');
		expect(names(list)).toEqual([]);
	});

	it('does nothing more once stopped', async () => {
		const { load, pending } = controlledLoads();
		const list = new LiveList<Item>({ collection: 'items', load, doing: 'load the items' });
		list.start();
		list.stop();
		pending[0].resolve([item('a')]);
		await flush();
		expect(list.status).toBe('loading');
		expect(watches).toHaveLength(0);
	});
});
