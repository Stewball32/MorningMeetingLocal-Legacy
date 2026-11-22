// The message bar at the bottom of an editor page: what just happened, with Undo when it can be
// undone. Show it with <NoticeBar {notices} />.

export interface Notice {
	text: string;
	/** 'success' messages fade after a while; errors stay until dismissed. */
	tone: 'success' | 'error';
	/** Offers an Undo button that runs this (the message goes away first). */
	undo?: () => void;
}

/** How long a success message stays. */
export const NOTICE_MS = 8000;

/**
 * One message at a time: a new one replaces the last.
 *
 * ```ts
 * const notices = new Notices();
 * onDestroy(() => notices.destroy());
 * notices.show({ text: `Saved ${name}.`, tone: 'success', undo: () => ... });
 * ```
 */
export class Notices {
	current: Notice | null = $state(null);
	#timer: ReturnType<typeof setTimeout> | undefined;

	show(next: Notice) {
		clearTimeout(this.#timer);
		this.current = next;
		if (next.tone === 'success') this.#timer = setTimeout(() => (this.current = null), NOTICE_MS);
	}

	dismiss = () => {
		this.current = null;
	};

	/** Runs the current message's Undo (and takes the message away). */
	undo = () => {
		const undo = this.current?.undo;
		this.current = null;
		undo?.();
	};

	/** Call it in onDestroy. */
	destroy() {
		clearTimeout(this.#timer);
	}
}
