// Notices when the day changes while the presenter is open (a smartboard left on overnight) and
// reloads the page, so every slide, the saved state and the realtime filters move to the new day.
//
// A reload is the only reliable way: the presenter copies its load data into local state once,
// so invalidateAll() would rerun the load but leave the page on yesterday's state.

import { getCurrentISOString } from '#lib';

export const CHECK_EVERY_MS = 60_000;
/** Screens that notice the new day at the same moment don't all reload at once. */
export const RELOAD_JITTER_MS = 3_000;
/** While a dialog is open (e.g. Add Guest), check again this often. */
export const BUSY_RETRY_MS = 5_000;

/** True when the local date (YYYY-MM-DD) is no longer the page's date. */
export const dayChanged = (pageDate: string, today: string = getCurrentISOString()) =>
	today !== pageDate;

/** A short random wait before reloading: 250 ms up to RELOAD_JITTER_MS. */
export const reloadDelay = (random: number = Math.random()) =>
	Math.round(250 + Math.min(Math.max(random, 0), 1) * (RELOAD_JITTER_MS - 250));

/** True while a modal dialog is open: reloading would throw away what is being entered. */
export const modalDialogOpen = (doc: Document = document) =>
	doc.querySelector('[role="dialog"][aria-modal="true"]:not([hidden])') !== null;

export interface DayWatchOptions {
	/** The date the page was loaded for (YYYY-MM-DD). */
	pageDate: string;
	today?: () => string;
	/** True while the reload has to wait. */
	isBusy?: () => boolean;
	reload?: () => void;
	random?: () => number;
	/** Where visibilitychange and focus are listened for. */
	target?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
}

/**
 * Checks the date every minute and whenever the page becomes visible or gets the focus, and
 * reloads (after a short random wait, and once no dialog is open) when it changed.
 * @returns A function that stops watching.
 */
export const watchDay = ({
	pageDate,
	today = getCurrentISOString,
	isBusy = () => modalDialogOpen(),
	reload = () => location.reload(),
	random = Math.random,
	target = window
}: DayWatchOptions) => {
	let reloadTimer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;

	const tryReload = () => {
		if (stopped) return;
		if (isBusy()) {
			reloadTimer = setTimeout(tryReload, BUSY_RETRY_MS);
			return;
		}
		reload();
	};
	const check = () => {
		if (stopped || reloadTimer !== undefined) return;
		if (!dayChanged(pageDate, today())) return;
		reloadTimer = setTimeout(tryReload, reloadDelay(random()));
	};

	const interval = setInterval(check, CHECK_EVERY_MS);
	target.addEventListener('visibilitychange', check);
	target.addEventListener('focus', check);
	return () => {
		stopped = true;
		clearInterval(interval);
		clearTimeout(reloadTimer);
		target.removeEventListener('visibilitychange', check);
		target.removeEventListener('focus', check);
	};
};
