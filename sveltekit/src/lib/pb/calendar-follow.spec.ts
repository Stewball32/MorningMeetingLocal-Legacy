import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionWatch } from './live.ts';

// followObservances() on top of a fake watchCollection: each call is recorded, and a test decides
// whether it succeeds or fails.
interface Watch {
	collection: string;
	watch: CollectionWatch<never>;
	stop: ReturnType<typeof vi.fn>;
}
const watches: Watch[] = [];
let failing = new Set<string>();
vi.mock('#lib/pb/live.ts', () => ({
	watchCollection: async (collection: string, watch: CollectionWatch<never>) => {
		if (failing.has(collection)) throw new Error('Failed to establish realtime connection.');
		const stop = vi.fn(async () => {});
		watches.push({ collection, watch, stop });
		return stop;
	}
}));
vi.mock('#lib/pb/index.ts', () => ({ pb: {}, getPbImageUrl: () => '' }));

const { FOLLOW_DELAY_MS, FOLLOW_RETRY_MS, followObservances } = await import('./calendar.ts');

const event = { action: 'update', record: {} } as never;
const watchOf = (collection: string) => watches.filter((w) => w.collection === collection).at(-1)!;

beforeEach(() => {
	vi.useFakeTimers();
	watches.length = 0;
	failing = new Set();
});
afterEach(() => vi.useRealTimers());

describe('followObservances', () => {
	it('follows observances, icons and people, and refetches once for a burst of changes', async () => {
		const onChange = vi.fn();
		const stop = followObservances(onChange);
		await vi.advanceTimersByTimeAsync(0);
		expect(watches.map((w) => w.collection).sort()).toEqual([
			'calendar_observances',
			'icons',
			'people'
		]);
		// deleting an icon: an icon event and updates of the observances that used it
		watchOf('icons').watch.onChange(event);
		watchOf('calendar_observances').watch.onChange(event);
		watchOf('calendar_observances').watch.onChange(event);
		await vi.advanceTimersByTimeAsync(FOLLOW_DELAY_MS - 1);
		expect(onChange).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(onChange).toHaveBeenCalledTimes(1);
		stop();
	});

	it('refetches when the connection comes back, not on the first connect', async () => {
		const onChange = vi.fn();
		const stop = followObservances(onChange);
		await vi.advanceTimersByTimeAsync(0);
		const { watch } = watchOf('calendar_observances');
		watch.onConnect();
		await vi.advanceTimersByTimeAsync(FOLLOW_DELAY_MS);
		expect(onChange).not.toHaveBeenCalled();
		watch.onDisconnect();
		watch.onConnect();
		await vi.advanceTimersByTimeAsync(FOLLOW_DELAY_MS);
		expect(onChange).toHaveBeenCalledTimes(1);
		stop();
	});

	it('tries again while PocketBase is down, then refetches what was missed', async () => {
		failing = new Set(['calendar_observances', 'icons', 'people']);
		const onChange = vi.fn();
		const stop = followObservances(onChange);
		await vi.advanceTimersByTimeAsync(FOLLOW_RETRY_MS);
		expect(watches).toHaveLength(0);
		failing = new Set();
		await vi.advanceTimersByTimeAsync(FOLLOW_RETRY_MS);
		expect(watches).toHaveLength(3);
		await vi.advanceTimersByTimeAsync(FOLLOW_DELAY_MS);
		expect(onChange).toHaveBeenCalledTimes(1);
		stop();
	});

	it('refetches when a birthday changes (a person edited or switched off)', async () => {
		const onChange = vi.fn();
		const stop = followObservances(onChange);
		await vi.advanceTimersByTimeAsync(0);
		watchOf('people').watch.onChange(event);
		await vi.advanceTimersByTimeAsync(FOLLOW_DELAY_MS);
		expect(onChange).toHaveBeenCalledTimes(1);
		stop();
		expect(watchOf('people').stop).toHaveBeenCalled();
	});

	it('stops everything: watches, retries and a pending refetch', async () => {
		failing = new Set(['icons']);
		const onChange = vi.fn();
		const stop = followObservances(onChange);
		await vi.advanceTimersByTimeAsync(0);
		watchOf('calendar_observances').watch.onChange(event);
		stop();
		expect(watchOf('calendar_observances').stop).toHaveBeenCalled();
		failing = new Set();
		await vi.advanceTimersByTimeAsync(FOLLOW_RETRY_MS * 3);
		expect(watches.filter((w) => w.collection === 'icons')).toHaveLength(0);
		expect(onChange).not.toHaveBeenCalled();
	});

	it('stops a watch that is only set up after the page went away', async () => {
		const stop = followObservances(vi.fn());
		stop();
		await vi.advanceTimersByTimeAsync(0);
		expect(watches.every((w) => w.stop.mock.calls.length === 1)).toBe(true);
	});
});
