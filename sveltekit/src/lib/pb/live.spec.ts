import { describe, expect, it, vi } from 'vitest';

// A fake of the SDK's realtime service, as far as watchCollection uses it.
type Listener = (event: unknown) => void;
const realtime = {
	subscriptions: {} as Record<string, Listener[]>,
	onDisconnect: undefined as ((active: string[]) => void) | undefined,
	failNext: false,
	async subscribe(topic: string, callback: (data: unknown) => void) {
		const listener: Listener = (event) => callback(event);
		(this.subscriptions[topic] ??= []).push(listener);
		if (this.failNext) {
			this.failNext = false;
			throw new Error('Failed to establish realtime connection.');
		}
		return () => this.unsubscribeByTopicAndListener(topic, listener);
	},
	async unsubscribeByTopicAndListener(topic: string, listener: Listener) {
		const list = this.subscriptions[topic] ?? [];
		const at = list.indexOf(listener);
		if (at >= 0) list.splice(at, 1);
		if (list.length === 0) delete this.subscriptions[topic];
	},
	send(topic: string, data: unknown) {
		for (const listener of this.subscriptions[topic] ?? []) listener(data);
	}
};
vi.mock('#lib/pb/index.ts', () => ({
	pb: {
		realtime,
		collection: (name: string) => ({
			subscribe: (topic: string, callback: (data: unknown) => void) =>
				realtime.subscribe(`${name}/${topic}`, callback)
		})
	}
}));

const { watchCollection } = await import('./live.ts');

const watcher = () => ({ onChange: vi.fn(), onConnect: vi.fn(), onDisconnect: vi.fn() });

describe('watchCollection', () => {
	it('passes on changes, connects and dropped connections', async () => {
		const watch = watcher();
		const stop = await watchCollection('icons', watch);
		realtime.send('icons/*', { action: 'create', record: { id: 'a' } });
		expect(watch.onChange).toHaveBeenCalledWith({ action: 'create', record: { id: 'a' } });
		realtime.send('PB_CONNECT', {});
		expect(watch.onConnect).toHaveBeenCalledTimes(1);
		realtime.onDisconnect?.(['icons/*']);
		expect(watch.onDisconnect).toHaveBeenCalledTimes(1);
		// An empty list: everything was unsubscribed on purpose.
		realtime.onDisconnect?.([]);
		expect(watch.onDisconnect).toHaveBeenCalledTimes(1);
		await stop();
		expect(realtime.subscriptions).toEqual({});
		expect(realtime.onDisconnect).toBeUndefined();
	});

	it('lets several watches run, stopped in any order', async () => {
		const previous = vi.fn();
		realtime.onDisconnect = previous;
		const icons = watcher();
		const observances = watcher();
		const stopIcons = await watchCollection('icons', icons);
		const stopObservances = await watchCollection('calendar_observances', observances);

		realtime.onDisconnect?.(['x']);
		expect(
			[icons.onDisconnect, observances.onDisconnect, previous].map((f) => f.mock.calls.length)
		).toEqual([1, 1, 1]);

		// The first one stops while the second is chained on top of it.
		await stopIcons();
		realtime.onDisconnect?.(['x']);
		expect(
			[icons.onDisconnect, observances.onDisconnect, previous].map((f) => f.mock.calls.length)
		).toEqual([1, 2, 2]);
		realtime.send('calendar_observances/*', { action: 'update' });
		expect(observances.onChange).toHaveBeenCalledTimes(1);

		await stopObservances();
		expect(realtime.subscriptions).toEqual({});
		realtime.onDisconnect?.(['x']);
		expect(previous).toHaveBeenCalledTimes(3);
		realtime.onDisconnect = undefined;
	});

	it('cleans up the listener a failed subscribe leaves behind', async () => {
		const other = await realtime.subscribe('people/*', () => {});
		const watch = watcher();
		realtime.failNext = true;
		await expect(watchCollection('icons', watch)).rejects.toThrow(/realtime connection/);
		// Only the other page's subscription is left, and onDisconnect is back as it was.
		expect(Object.keys(realtime.subscriptions)).toEqual(['people/*']);
		expect(realtime.onDisconnect).toBeUndefined();
		await other();
	});

	it('cleans up when the collection subscription fails after PB_CONNECT', async () => {
		const watch = watcher();
		const subscribe = realtime.subscribe.bind(realtime);
		const spy = vi.spyOn(realtime, 'subscribe').mockImplementation(async (topic, callback) => {
			if (topic === 'icons/*') realtime.failNext = true;
			return subscribe(topic, callback);
		});
		await expect(watchCollection('icons', watch)).rejects.toThrow();
		expect(realtime.subscriptions).toEqual({});
		spy.mockRestore();
	});
});
