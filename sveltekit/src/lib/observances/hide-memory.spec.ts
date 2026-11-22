import { describe, expect, it } from 'vitest';
import { HideMemory, type MemoryStore } from './hide-memory.ts';

/** A stand-in for localStorage that a second HideMemory (a reload) can read too. */
function fakeStorage(): MemoryStore & { values: Map<string, string> } {
	const values = new Map<string, string>();
	return {
		values,
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => void values.set(key, value)
	};
}

const halloween = { id: 'hal0ween0000001', updated: '2026-10-01 08:00:00.000Z' };

describe('HideMemory', () => {
	it('knows that Hide turned the changes on, until the record changes again', () => {
		const memory = new HideMemory(fakeStorage());
		expect(memory.turnedOn(halloween)).toBe(false);
		memory.remember(halloween);
		expect(memory.turnedOn(halloween)).toBe(true);
		// Saved again since (e.g. its picture was changed while it was hidden): Show leaves it on.
		expect(memory.turnedOn({ ...halloween, updated: '2026-10-02 09:00:00.000Z' })).toBe(false);
		expect(memory.turnedOn({ ...halloween, id: 'someotherrecord' })).toBe(false);
	});

	it('forgets once Show has turned them off again', () => {
		const memory = new HideMemory(fakeStorage());
		memory.remember(halloween);
		memory.forget(halloween.id);
		expect(memory.turnedOn(halloween)).toBe(false);
		memory.forget('nevershown00000');
	});

	it('still knows after a reload (a holiday hidden this year may be shown next year)', () => {
		const storage = fakeStorage();
		new HideMemory(storage).remember(halloween);
		expect(new HideMemory(storage).turnedOn(halloween)).toBe(true);
	});

	it('copes with storage it cannot read or write', () => {
		const broken: MemoryStore = {
			getItem: () => '{not json',
			setItem: () => {
				throw new Error('QuotaExceededError');
			}
		};
		const memory = new HideMemory(broken);
		const errors = console.error;
		console.error = () => {};
		try {
			memory.remember(halloween);
		} finally {
			console.error = errors;
		}
		expect(memory.turnedOn(halloween)).toBe(false);
		// A record with no `updated` (never saved) is never taken for one Hide turned on.
		const fresh = new HideMemory(fakeStorage());
		fresh.remember({ id: 'x' });
		expect(fresh.turnedOn({ id: 'x' })).toBe(false);
	});

	it('works without localStorage (in the tests, as in a browser with storage off)', () => {
		const memory = new HideMemory();
		memory.remember(halloween);
		expect(memory.turnedOn(halloween)).toBe(true);
	});
});
