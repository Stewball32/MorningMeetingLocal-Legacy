// The presenter's copy of today's class_dailies record, and the one way it is saved.
//
// - Every change is applied to the local copy first (the slides show it right away), then saved.
// - Saves go out one at a time (a promise chain), by the record's id, and each one sends the
//   latest local value of the fields that changed. PocketBase replaces a JSON field as a whole,
//   so two saves in flight at once could land out of order and undo the newer one.
// - A realtime echo (or a refetch) never replaces newer local state: while saves are on their way
//   it waits, and once they are done the newest record wins (by `updated`), except for fields
//   whose changes haven't been saved yet.
// - A save that fails keeps its fields marked unsaved; `flush()` sends them again (the presenter
//   calls it when the connection to PocketBase comes back).

/** The parts of a class_dailies record this module needs. */
export interface DailyRecord {
	id: string;
	date: string;
	updated?: string;
	[field: string]: unknown;
}

export interface ClassDailySyncOptions<T extends DailyRecord> {
	/** The record as loaded; an empty id means there is none yet (`ensure` gets one). */
	initial: T;
	/** Fetches the day's record, creating it if needed. */
	ensure: () => Promise<T>;
	/** Saves fields of the record with this id and resolves to the saved record. */
	write: (id: string, fields: Partial<T>) => Promise<T>;
	/** Called with the new local copy every time it changes. */
	onChange: (record: T) => void;
	/** Called when a save fails (the change stays local and unsaved). */
	onError?: (error: unknown) => void;
	/** Called after a save went through. */
	onSaved?: () => void;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** Same JSON content (field order aside, as PocketBase may reorder keys). */
export const sameContent = (a: unknown, b: unknown): boolean => {
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b))
		return a.length === b.length && a.every((value, i) => sameContent(value, b[i]));
	if (isPlainObject(a) && isPlainObject(b)) {
		const keys = Object.keys(a).filter((key) => a[key] !== undefined);
		const otherKeys = Object.keys(b).filter((key) => b[key] !== undefined);
		return keys.length === otherKeys.length && keys.every((key) => sameContent(a[key], b[key]));
	}
	// PocketBase stores an empty JSON field as null; locally it may still be undefined
	return (a ?? null) === (b ?? null);
};

/** True if `record` is newer than `than` (PocketBase's `updated` sorts as text). */
export const isNewer = (record: DailyRecord, than: DailyRecord) =>
	(record.updated ?? '') > (than.updated ?? '');

/**
 * `incoming` over `local`, keeping the local value of the fields in `keep` (unsaved changes), and
 * keeping local objects whose content didn't change, so the slides don't redo their work.
 */
export const mergeRecord = <T extends DailyRecord>(
	local: T,
	incoming: T,
	keep: ReadonlySet<string> = new Set()
): T => {
	const merged: Record<string, unknown> = { ...incoming };
	for (const key of Object.keys(local)) {
		if (keep.has(key) || sameContent(local[key], incoming[key])) merged[key] = local[key];
	}
	return merged as T;
};

/** One column (a JSON field) with a partial change applied, as a new object. */
export const withColumn = <T extends DailyRecord>(
	record: T,
	column: string,
	partial: Record<string, unknown>
): T => {
	const current = isPlainObject(record[column]) ? record[column] : {};
	return { ...record, [column]: { ...current, ...partial } };
};

export class ClassDailySync<T extends DailyRecord> {
	#local: T;
	#options: ClassDailySyncOptions<T>;
	/** Fields changed locally and not saved yet, each with the number of its latest change. */
	#unsaved = new Map<string, number>();
	#changes = 0;
	/** Saves queued or on their way. */
	#pending = 0;
	#chain: Promise<void> = Promise.resolve();
	/** The newest record PocketBase sent while saves were pending (a save result or an echo). */
	#waiting: T | null = null;

	constructor(options: ClassDailySyncOptions<T>) {
		this.#options = options;
		this.#local = options.initial;
	}

	/** The local copy (with every change made so far, saved or not). */
	get current(): T {
		return this.#local;
	}

	/** Fields changed but not saved yet. */
	get unsaved(): string[] {
		return [...this.#unsaved.keys()];
	}

	/** True while saves are queued or on their way. */
	get busy(): boolean {
		return this.#pending > 0;
	}

	/** Changes top-level fields (e.g. `{ slide: 1 }`) and saves them. */
	update(fields: Partial<T>): Promise<void> {
		this.#setLocal({ ...this.#local, ...fields });
		for (const key of Object.keys(fields)) this.#unsaved.set(key, ++this.#changes);
		return this.#save();
	}

	/** Merges a partial change into one JSON column (e.g. `attendance`) and saves that column. */
	updateColumn(column: string, partial: Record<string, unknown>): Promise<void> {
		this.#setLocal(withColumn(this.#local, column, partial));
		this.#unsaved.set(column, ++this.#changes);
		return this.#save();
	}

	/** A record from PocketBase (a realtime event or a refetch). */
	receive(record: T) {
		if (!this.#belongs(record)) return;
		if (this.#pending > 0) {
			// a save is on its way: the newest record is applied once they are all done
			if (!this.#waiting || isNewer(record, this.#waiting)) this.#waiting = record;
			return;
		}
		if (!this.#local.id || isNewer(record, this.#local)) this.#apply(record);
	}

	/** Saves the changes that haven't been saved yet (and creates the record if there is none). */
	flush(): Promise<void> {
		if (this.#local.id && this.#unsaved.size === 0) return this.#chain;
		return this.#save();
	}

	#belongs(record: T) {
		return this.#local.id ? record.id === this.#local.id : record.date === this.#local.date;
	}

	#setLocal(record: T) {
		this.#local = record;
		this.#options.onChange(record);
	}

	#apply(record: T) {
		this.#setLocal(mergeRecord(this.#local, record, new Set(this.#unsaved.keys())));
	}

	#save(): Promise<void> {
		this.#pending++;
		const run = async () => {
			try {
				await this.#send();
			} catch (error) {
				this.#options.onError?.(error);
			} finally {
				this.#pending--;
				if (this.#pending === 0 && this.#waiting) {
					const record = this.#waiting;
					this.#waiting = null;
					if (!this.#local.id || isNewer(record, this.#local)) this.#apply(record);
				}
			}
		};
		this.#chain = this.#chain.then(run);
		return this.#chain;
	}

	/** Gets (or creates) the day's record and takes it over, keeping the unsaved changes. */
	async #adopt() {
		const record = await this.#options.ensure();
		this.#local = { ...this.#local, id: record.id };
		this.#apply(record);
	}

	async #send() {
		if (!this.#local.id) await this.#adopt();
		if (this.#unsaved.size === 0) return;
		const sent = new Map(this.#unsaved);
		const fields: Record<string, unknown> = {};
		for (const key of sent.keys()) fields[key] = this.#local[key];
		let saved: T;
		try {
			saved = await this.#options.write(this.#local.id, fields as Partial<T>);
		} catch (error) {
			// the record was deleted (e.g. in the PocketBase admin): save into the day's record again
			if ((error as { status?: number } | null)?.status !== 404) throw error;
			await this.#adopt();
			saved = await this.#options.write(this.#local.id, fields as Partial<T>);
		}
		for (const [key, change] of sent) {
			if (this.#unsaved.get(key) === change) this.#unsaved.delete(key);
		}
		if (!this.#waiting || !isNewer(this.#waiting, saved)) this.#waiting = saved;
		this.#options.onSaved?.();
	}
}
