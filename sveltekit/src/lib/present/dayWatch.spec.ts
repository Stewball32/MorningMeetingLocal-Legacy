import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	BUSY_RETRY_MS,
	CHECK_EVERY_MS,
	RELOAD_JITTER_MS,
	dayChanged,
	reloadDelay,
	watchDay
} from './dayWatch.ts';
import { getCurrentISOString } from '#lib';

describe('dayChanged', () => {
	it('compares the page date with the local date', () => {
		expect(dayChanged('2026-11-23', '2026-11-23')).toBe(false);
		expect(dayChanged('2026-11-23', '2026-11-24')).toBe(true);
	});

	it('uses the local date, not UTC (late evening in Los Angeles is already tomorrow in UTC)', () => {
		vi.useFakeTimers();
		// 23:30 local on Nov 23 in the time zone the tests run in
		vi.setSystemTime(new Date(2026, 10, 23, 23, 30));
		expect(getCurrentISOString()).toBe('2026-11-23');
		expect(dayChanged('2026-11-23')).toBe(false);
		vi.setSystemTime(new Date(2026, 10, 24, 0, 0, 5));
		expect(dayChanged('2026-11-23')).toBe(true);
		vi.useRealTimers();
	});
});

describe('reloadDelay', () => {
	it('stays between 250 ms and the jitter limit', () => {
		expect(reloadDelay(0)).toBe(250);
		expect(reloadDelay(1)).toBe(RELOAD_JITTER_MS);
		expect(reloadDelay(0.5)).toBeGreaterThan(250);
		expect(reloadDelay(-1)).toBe(250);
		expect(reloadDelay(2)).toBe(RELOAD_JITTER_MS);
	});
});

describe('watchDay', () => {
	let today = '2026-11-23';
	let busy = false;
	let target: EventTarget;
	let reload: ReturnType<typeof vi.fn<() => void>>;
	let stop: () => void;

	beforeEach(() => {
		vi.useFakeTimers();
		today = '2026-11-23';
		busy = false;
		target = new EventTarget();
		reload = vi.fn<() => void>();
		stop = watchDay({
			pageDate: '2026-11-23',
			today: () => today,
			isBusy: () => busy,
			reload,
			random: () => 0.5,
			target
		});
	});
	afterEach(() => {
		stop();
		vi.useRealTimers();
	});

	it('does nothing while it is still the same day', () => {
		vi.advanceTimersByTime(CHECK_EVERY_MS * 10);
		target.dispatchEvent(new Event('focus'));
		vi.advanceTimersByTime(RELOAD_JITTER_MS);
		expect(reload).not.toHaveBeenCalled();
	});

	it('reloads within a minute and a few seconds after midnight', () => {
		today = '2026-11-24';
		vi.advanceTimersByTime(CHECK_EVERY_MS - 1);
		expect(reload).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1 + reloadDelay(0.5));
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('checks right away when the page is shown again or focused', () => {
		today = '2026-11-24';
		target.dispatchEvent(new Event('visibilitychange'));
		vi.advanceTimersByTime(reloadDelay(0.5));
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('waits while a dialog is open, then reloads', () => {
		today = '2026-11-24';
		busy = true;
		target.dispatchEvent(new Event('focus'));
		vi.advanceTimersByTime(reloadDelay(0.5) + BUSY_RETRY_MS * 3);
		expect(reload).not.toHaveBeenCalled();
		busy = false;
		vi.advanceTimersByTime(BUSY_RETRY_MS);
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('schedules one reload however many checks see the new day', () => {
		today = '2026-11-24';
		target.dispatchEvent(new Event('focus'));
		target.dispatchEvent(new Event('visibilitychange'));
		vi.advanceTimersByTime(CHECK_EVERY_MS);
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('stops a click or key press after the date changed and reloads at once', () => {
		const slide = vi.fn();
		for (const type of ['click', 'keydown']) target.addEventListener(type, slide);
		today = '2026-11-24';
		const click = new Event('click', { cancelable: true });
		target.dispatchEvent(click);
		target.dispatchEvent(new Event('keydown', { cancelable: true }));
		expect(slide).not.toHaveBeenCalled();
		expect(click.defaultPrevented).toBe(true);
		expect(reload).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(CHECK_EVERY_MS * 2);
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('lets input through on the same day', () => {
		const slide = vi.fn();
		target.addEventListener('click', slide);
		target.dispatchEvent(new Event('click', { cancelable: true }));
		expect(slide).toHaveBeenCalledTimes(1);
		expect(reload).not.toHaveBeenCalled();
	});

	it('lets input through while a dialog is open, then reloads once it is closed', () => {
		const dialog = vi.fn();
		target.addEventListener('keydown', dialog);
		today = '2026-11-24';
		busy = true;
		target.dispatchEvent(new Event('keydown', { cancelable: true }));
		expect(dialog).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(reloadDelay(0.5) + BUSY_RETRY_MS);
		expect(reload).not.toHaveBeenCalled();
		busy = false;
		vi.advanceTimersByTime(BUSY_RETRY_MS);
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('stops when told to', () => {
		stop();
		today = '2026-11-24';
		target.dispatchEvent(new Event('focus'));
		vi.advanceTimersByTime(CHECK_EVERY_MS * 2);
		expect(reload).not.toHaveBeenCalled();
	});
});
