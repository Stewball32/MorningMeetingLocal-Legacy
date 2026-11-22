import { describe, expect, it, vi } from 'vitest';
import {
	ClassDailySync,
	isNewer,
	mergeRecord,
	sameContent,
	withColumn,
	type DailyRecord
} from './classDaily.ts';

interface Daily extends DailyRecord {
	slide?: number;
	attendance?: Record<string, unknown> | null;
	calendar?: Record<string, unknown> | null;
}

/** A PocketBase stand-in: whole-field replacement, `updated` stamps, answers on demand. */
const fakeServer = (initial: Daily) => {
	let tick = 0;
	const stamp = () => `2026-11-23 08:00:00.${String(++tick).padStart(3, '0')}Z`;
	const server = {
		record: { ...initial, updated: initial.updated ?? stamp() } as Daily,
		writes: [] as { id: string; fields: Partial<Daily> }[],
		inFlight: 0,
		maxInFlight: 0,
		/** pending answers; resolve them in any order */
		pending: [] as (() => void)[],
		auto: true,
		fail: null as unknown,
		stamp,
		write: (id: string, fields: Partial<Daily>) =>
			new Promise<Daily>((resolve, reject) => {
				server.writes.push({ id, fields: structuredClone(fields) });
				server.inFlight++;
				server.maxInFlight = Math.max(server.maxInFlight, server.inFlight);
				const answer = () => {
					server.inFlight--;
					if (server.fail) return reject(server.fail);
					if (id !== server.record.id) return reject({ status: 404 });
					server.record = { ...server.record, ...structuredClone(fields), updated: stamp() };
					resolve(structuredClone(server.record));
				};
				if (server.auto) queueMicrotask(answer);
				else server.pending.push(answer);
			})
	};
	return server;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const setup = (initial: Daily = { id: 'rec1', date: '2026-11-23', slide: 0, attendance: null }) => {
	const server = fakeServer(initial);
	const changes: Daily[] = [];
	const onError = vi.fn();
	const sync = new ClassDailySync<Daily>({
		initial: structuredClone(server.record),
		ensure: async () => structuredClone(server.record),
		write: server.write,
		onChange: (record) => changes.push(record),
		onError
	});
	return { server, sync, changes, onError };
};

describe('helpers', () => {
	it('compares JSON content, ignoring key order and undefined keys', () => {
		expect(sameContent({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
		expect(sameContent({ a: 1, b: undefined }, { a: 1 })).toBe(true);
		expect(sameContent(undefined, null)).toBe(true);
		expect(sameContent([1, 2], [2, 1])).toBe(false);
		expect(sameContent({ a: 1 }, { a: 2 })).toBe(false);
	});

	it('orders records by updated', () => {
		const a = { id: 'x', date: 'd', updated: '2026-11-23 08:00:00.100Z' };
		const b = { id: 'x', date: 'd', updated: '2026-11-23 08:00:00.200Z' };
		expect(isNewer(b, a)).toBe(true);
		expect(isNewer(a, b)).toBe(false);
		expect(isNewer(a, a)).toBe(false);
	});

	it('merges a column partial into a new object', () => {
		const record: Daily = { id: 'x', date: 'd', attendance: { page: 1, hasGuests: true } };
		const next = withColumn(record, 'attendance', { page: 2 });
		expect(next.attendance).toEqual({ page: 2, hasGuests: true });
		expect(record.attendance).toEqual({ page: 1, hasGuests: true });
		expect(
			withColumn({ id: 'x', date: 'd', calendar: null }, 'calendar', { page: 1 }).calendar
		).toEqual({ page: 1 });
	});

	it('keeps unchanged local objects and unsaved fields when merging a record in', () => {
		const attendance = { page: 1, studentMath: { oneGuesses: [3] } };
		const local: Daily = { id: 'x', date: 'd', updated: 'a', attendance, calendar: { page: 0 } };
		const incoming: Daily = {
			id: 'x',
			date: 'd',
			updated: 'b',
			attendance: { studentMath: { oneGuesses: [3] }, page: 1 },
			calendar: { page: 1 },
			slide: 1
		};
		const merged = mergeRecord(local, incoming, new Set(['calendar']));
		expect(merged.attendance).toBe(attendance); // same content: same object
		expect(merged.calendar).toEqual({ page: 0 }); // unsaved: local wins
		expect(merged.slide).toBe(1);
		expect(merged.updated).toBe('b');
	});
});

describe('ClassDailySync', () => {
	it('shows a change at once and saves only that field, by id', async () => {
		const { server, sync, changes } = setup();
		const done = sync.update({ slide: 1 });
		expect(sync.current.slide).toBe(1);
		expect(changes.at(-1)?.slide).toBe(1);
		await done;
		expect(server.writes).toEqual([{ id: 'rec1', fields: { slide: 1 } }]);
		expect(server.record.slide).toBe(1);
	});

	it('sends saves one at a time, each built on the latest local state (F6: page + math offsets)', async () => {
		const { server, sync } = setup();
		server.auto = false;
		// the arrow saves the page, and the newly shown math page saves its offsets right away
		sync.updateColumn('attendance', { page: 1 });
		sync.updateColumn('attendance', { studentMath: { oneOptDist: 0.5 } });
		await settle();
		expect(server.inFlight).toBe(1);
		// answer in order; the second save finds nothing left to send
		while (server.pending.length) {
			server.pending.shift()!();
			await settle();
		}
		expect(server.maxInFlight).toBe(1);
		expect(server.record.attendance).toEqual({ page: 1, studentMath: { oneOptDist: 0.5 } });
		expect(sync.current.attendance).toEqual({ page: 1, studentMath: { oneOptDist: 0.5 } });
		expect(sync.unsaved).toEqual([]);
	});

	it('sends a change made while a save is in flight in the next save', async () => {
		const { server, sync } = setup();
		server.auto = false;
		sync.updateColumn('calendar', { weekdayGuesses: ['Friday'] });
		await settle();
		sync.updateColumn('calendar', { weekdayGuesses: ['Monday', 'Friday'] });
		sync.updateColumn('calendar', { currentCheck: 'month' });
		server.pending.shift()!();
		await settle();
		expect(server.writes).toHaveLength(2);
		server.pending.shift()!();
		await settle();
		expect(server.record.calendar).toEqual({
			weekdayGuesses: ['Monday', 'Friday'],
			currentCheck: 'month'
		});
		expect(server.maxInFlight).toBe(1);
	});

	it("doesn't let an echo replace newer local state while saves are pending", async () => {
		const { server, sync } = setup();
		server.auto = false;
		sync.updateColumn('calendar', { calendarGuesses: [5] });
		await settle();
		// an older echo (from before this save) arrives
		sync.receive({ ...structuredClone(server.record), updated: server.stamp(), calendar: null });
		expect(sync.current.calendar).toEqual({ calendarGuesses: [5] });
		server.pending.shift()!();
		await settle();
		// the save's result is newer than that echo, and wins
		expect(sync.current.calendar).toEqual({ calendarGuesses: [5] });
		// the echo of the save itself (same `updated`) changes nothing
		const before = sync.current;
		sync.receive(structuredClone(server.record));
		expect(sync.current).toBe(before);
	});

	it('applies another screen’s newer change once idle, keeping unsaved fields', async () => {
		const { server, sync, onError } = setup();
		server.fail = { status: 0 };
		await sync.updateColumn('calendar', { calendarGuesses: [9] });
		expect(onError).toHaveBeenCalledTimes(1);
		expect(sync.unsaved).toEqual(['calendar']);
		// another screen moved on to slide 1 and changed attendance
		sync.receive({
			...server.record,
			slide: 1,
			attendance: { page: 4 },
			calendar: { calendarGuesses: [1] },
			updated: server.stamp()
		});
		expect(sync.current.slide).toBe(1);
		expect(sync.current.attendance).toEqual({ page: 4 });
		expect(sync.current.calendar).toEqual({ calendarGuesses: [9] }); // not saved yet: kept
		// PocketBase is back: flush sends it
		server.fail = null;
		await sync.flush();
		expect(server.writes.at(-1)).toEqual({
			id: 'rec1',
			fields: { calendar: { calendarGuesses: [9] } }
		});
		expect(sync.unsaved).toEqual([]);
	});

	it('ignores records of other days and other ids', () => {
		const { sync } = setup();
		const before = sync.current;
		sync.receive({ id: 'other', date: '2026-11-23', updated: '9999', slide: 1 });
		sync.receive({ id: 'old', date: '2026-11-22', updated: '9999', slide: 1 });
		expect(sync.current).toBe(before);
	});

	it('creates the day’s record first when there is none, then saves into it', async () => {
		const server = fakeServer({ id: 'new1', date: '2026-11-24' });
		const ensure = vi.fn(async () => structuredClone(server.record));
		const sync = new ClassDailySync<Daily>({
			initial: { id: '', date: '2026-11-24' },
			ensure,
			write: server.write,
			onChange: () => {}
		});
		sync.update({ slide: 1 });
		sync.updateColumn('attendance', { page: 2 });
		await sync.flush();
		expect(ensure).toHaveBeenCalledTimes(1);
		expect(sync.current.id).toBe('new1');
		expect(server.writes).toEqual([{ id: 'new1', fields: { slide: 1, attendance: { page: 2 } } }]);
	});

	it('takes over a record another screen created (same date) before it has one', () => {
		const sync = new ClassDailySync<Daily>({
			initial: { id: '', date: '2026-11-24' },
			ensure: async () => ({ id: 'x', date: '2026-11-24' }),
			write: async () => ({ id: 'x', date: '2026-11-24' }),
			onChange: () => {}
		});
		sync.receive({ id: 'shared', date: '2026-11-24', updated: 'a', slide: 1 });
		expect(sync.current.id).toBe('shared');
		expect(sync.current.slide).toBe(1);
	});

	it('saves into the day’s record again when its record was deleted (404)', async () => {
		const server = fakeServer({ id: 'gone', date: '2026-11-23' });
		const sync = new ClassDailySync<Daily>({
			initial: structuredClone(server.record),
			ensure: async () => {
				server.record = { id: 'again', date: '2026-11-23', updated: server.stamp() };
				return structuredClone(server.record);
			},
			write: server.write,
			onChange: () => {}
		});
		server.record = { ...server.record, id: 'deleted-meanwhile' };
		await sync.update({ slide: 1 });
		expect(server.writes.map((w) => w.id)).toEqual(['gone', 'again']);
		expect(server.record).toMatchObject({ id: 'again', slide: 1 });
		expect(sync.current.id).toBe('again');
	});

	it('survives many quick changes with answers coming back out of order', async () => {
		const { server, sync } = setup();
		server.auto = false;
		for (let i = 1; i <= 8; i++) sync.updateColumn('calendar', { step: i, [`k${i}`]: true });
		// answer whatever is pending, newest first, until everything is saved
		for (let round = 0; round < 20 && (server.pending.length || sync.busy); round++) {
			server.pending.reverse().forEach((answer) => answer());
			server.pending = [];
			await settle();
		}
		expect(server.maxInFlight).toBe(1);
		expect(server.record.calendar).toMatchObject({ step: 8, k1: true, k8: true });
		expect(sync.current.calendar).toEqual(server.record.calendar);
	});
});
