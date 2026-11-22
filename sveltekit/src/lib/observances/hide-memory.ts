// Hide / Show on a built-in holiday, undone exactly.
//
// Hiding only counts while a settings record's changes are used (is_active; an inactive record is
// ignored by the calendar). So Hide on a holiday whose changes are off has to turn them on, and
// Show must then turn them off again, or the old changes (e.g. "No school") would come back with
// the holiday. This remembers, in this browser, which records Hide turned on: record id -> the
// record's `updated` right after that Hide. Any later change to the record (a save in the form,
// here or in another window) gives it a new `updated`, so the memory no longer applies and Show
// leaves the changes as they are then. It is kept in localStorage, because a holiday hidden this
// year may only be shown again next year.

/** What the memory needs of a record. */
export interface Stamped {
	id: string;
	updated?: string;
}

/** Where the memory is kept (localStorage, or a stand-in when it can't be used). */
export type MemoryStore = Pick<Storage, 'getItem' | 'setItem'>;

const KEY = 'morning-meeting:observances:turned-on-by-hide';

/** A stand-in that forgets when the page goes away (e.g. storage switched off). */
function pageStore(): MemoryStore {
	const values = new Map<string, string>();
	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => void values.set(key, value)
	};
}

function browserStore(): MemoryStore {
	try {
		const storage = globalThis.localStorage;
		if (storage) return storage;
	} catch {
		// localStorage can throw when storage is switched off.
	}
	return pageStore();
}

export class HideMemory {
	#store: MemoryStore;

	constructor(store: MemoryStore = browserStore()) {
		this.#store = store;
	}

	#read(): Record<string, string> {
		try {
			const value: unknown = JSON.parse(this.#store.getItem(KEY) ?? '{}');
			return value && typeof value === 'object' ? (value as Record<string, string>) : {};
		} catch {
			return {};
		}
	}

	#write(stamps: Record<string, string>) {
		try {
			this.#store.setItem(KEY, JSON.stringify(stamps));
		} catch (error) {
			console.error('Could not remember what Hide changed', error);
		}
	}

	/** Hide just turned this record's changes on (`record` as saved by that Hide). */
	remember(record: Stamped) {
		if (!record.updated) return;
		this.#write({ ...this.#read(), [record.id]: record.updated });
	}

	/** Nothing to undo for this record any more (e.g. it was just shown again). */
	forget(id: string) {
		const stamps = this.#read();
		if (!(id in stamps)) return;
		delete stamps[id];
		this.#write(stamps);
	}

	/** Whether Hide turned the record's changes on and nothing changed the record since. */
	turnedOn(record: Stamped): boolean {
		return !!record.updated && this.#read()[record.id] === record.updated;
	}
}
