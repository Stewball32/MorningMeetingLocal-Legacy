import type { UnsubscribeFunc } from 'pocketbase';
import { pb } from '#lib/pb/index.ts';

type Listeners = Record<string, EventListener[] | undefined>;

/**
 * The realtime subscriptions of one page. Each one is stopped with its own UnsubscribeFunc, so
 * other components' listeners on the same topics keep working.
 */
export class Subscriptions {
	#stops: Promise<UnsubscribeFunc | null>[] = [];

	/**
	 * Starts a subscription. `topic` is the realtime topic `start` subscribes to (e.g.
	 * 'people/*' for pb.collection('people').subscribe('*', ...), or 'PB_CONNECT').
	 */
	add(topic: string, start: () => Promise<UnsubscribeFunc>) {
		const realtime = pb.realtime;
		const subscribing = start();
		// subscribe() adds its listener before it connects and leaves it there if connecting
		// fails; it is the topic's last listener right after the call (added before any await).
		const listeners = (realtime as unknown as { subscriptions?: Listeners }).subscriptions?.[topic];
		const listener = listeners?.[listeners.length - 1];
		this.#stops.push(
			subscribing.catch(async (error) => {
				console.error(`Couldn't subscribe to ${topic}:`, error);
				if (listener) await realtime.unsubscribeByTopicAndListener(topic, listener).catch(() => {});
				return null;
			})
		);
	}

	/** Stops every subscription (also the ones still being set up). */
	async stop() {
		const stops = this.#stops.splice(0);
		await Promise.allSettled(stops.map(async (stop) => (await stop)?.()));
	}
}
