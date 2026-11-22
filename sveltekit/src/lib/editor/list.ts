// Pure helpers for the lists the editor pages keep (people, icons, observances): applying live
// changes, sorting like the slides, and wording counts.

/** Anything with a PocketBase record id. */
export interface WithId {
	id: string;
}

/**
 * Adds the record, or replaces the one with the same id (a realtime create/update, or the answer
 * to a save). Returns a new list; the old one is left as it is.
 */
export function upsert<T extends WithId>(list: readonly T[], record: T): T[] {
	const index = list.findIndex((item) => item.id === record.id);
	if (index === -1) return [...list, record];
	const next = [...list];
	next[index] = record;
	return next;
}

/** Drops the record with this id (a realtime delete). Returns a new list. */
export function remove<T extends WithId>(list: readonly T[], id: string): T[] {
	return list.filter((item) => item.id !== id);
}

/**
 * The slides list records with PocketBase's `sort: 'name'`, which compares the stored text as is
 * (SQLite's default BINARY collation: "Zed" before "anna"). Compare the same way so an editor
 * keeps the slides' order, falling back to the id so the order never flickers.
 */
export function compareByName(a: WithId & { name: string }, b: WithId & { name: string }): number {
	if (a.name !== b.name) return a.name < b.name ? -1 : 1;
	if (a.id !== b.id) return a.id < b.id ? -1 : 1;
	return 0;
}

/**
 * The record's id followed by the ids of the rows after and before it in `list`: where focus can
 * go when its row disappears (see FocusReturn). Just [id] when it isn't in the list.
 */
export function withNeighbours(list: readonly WithId[], id: string): string[] {
	const index = list.findIndex((item) => item.id === id);
	if (index === -1) return [id];
	return [list[index], list[index + 1], list[index - 1]].flatMap((item) => (item ? [item.id] : []));
}

/** "1 day" / "12 days" (pass `many` for irregular plurals). */
export function plural(count: number, one: string, many = `${one}s`): string {
	return `${count} ${count === 1 ? one : many}`;
}
