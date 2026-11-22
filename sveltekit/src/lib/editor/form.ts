// Generic helpers for the Add / Edit forms of the editor pages. Each page keeps its own form
// module (values kept exactly as typed, validate, values -> record fields) and uses these for the
// parts every form shares.

/** How a save went: a new record, saved changes, or nothing to save (no request was sent). */
export type SaveOutcome = 'created' | 'saved' | 'unchanged';

/** A message per form field (undefined or missing: no problem). */
export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

/** Whether any field has a message. */
export function hasErrors(errors: FieldErrors<string>): boolean {
	return Object.values(errors).some(Boolean);
}

/**
 * Whether two sets of form values are the same, ignoring spaces around text: the test for
 * "anything to discard?" when Escape is pressed. Compares the keys of `a` with `===` otherwise.
 */
export function sameValues<T extends object>(a: T, b: T): boolean {
	return (Object.keys(a) as (keyof T)[]).every((field) =>
		typeof a[field] === 'string'
			? String(a[field]).trim() === String(b[field]).trim()
			: a[field] === b[field]
	);
}

/** `===`, except that two arrays are the same when their items are (e.g. a list of dates). */
const sameField = (a: unknown, b: unknown): boolean =>
	Array.isArray(a) && Array.isArray(b)
		? a.length === b.length && a.every((item, index) => item === b[index])
		: a === b;

/**
 * The record fields that differ between what the form started with and what it saves (both
 * built by the page's "form values -> fields" function), compared with `===` (arrays item by
 * item). Send only these on an edit, so a change made meanwhile in another window (say, a switch
 * flipped there) is not overwritten by an edit that never touched it. Empty: nothing to save, so
 * send nothing.
 */
export function changedFields<T extends object>(before: T, after: T): Partial<T> {
	const changes: Partial<T> = {};
	for (const key of Object.keys(after) as (keyof T)[]) {
		if (!sameField(before[key], after[key])) changes[key] = after[key];
	}
	return changes;
}
