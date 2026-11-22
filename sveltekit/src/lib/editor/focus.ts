// Keeping keyboard focus in a sensible place while rows come and go.
import { tick } from 'svelte';

export interface FocusTargets {
	/** The element to focus in a record's row, e.g. id => `li[data-person="${id}"] [data-edit]`. */
	row: (id: string) => string;
	/** The group's Add button, e.g. key => `[data-group="${key}"] header button`. */
	group: (key: string) => string;
	/** The last resort, e.g. the header's Add button: '[data-add-person]'. */
	fallback: string;
}

/**
 * Where focus goes when an editor dialog closes (EditorDialog's `finalFocusEl`). zag gives it
 * back to the button that opened the dialog, but that button is gone when the save moved the row
 * to another group or the record was deleted: then it goes to the record's row (wherever it is
 * now), a neighbouring row, the group's Add button or, last, `fallback`.
 *
 * ```ts
 * const focus = new FocusReturn({ row: (id) => `li[data-icon="${id}"] [data-edit]`, ... });
 * function openEdit(icon) { focus.remember(withNeighbours(groupList, icon.id), groupKey); ... }
 * <EditorDialog finalFocusEl={focus.target} ...>
 * ```
 */
export class FocusReturn {
	#targets: FocusTargets;
	#opener: Element | null = null;
	/** The record's id first, then its neighbours' (see withNeighbours). */
	ids: string[] = [];
	#group: string | null = null;

	constructor(targets: FocusTargets) {
		this.#targets = targets;
	}

	/** Call when a dialog opens: the focused element (the opener), the rows to try, the group. */
	remember(ids: string[], group: string | null) {
		this.#opener = document.activeElement;
		this.ids = ids;
		this.#group = group;
	}

	/** The element to focus now (null: let zag decide). */
	target = (): HTMLElement | null => {
		const opener = this.#opener;
		if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body)
			return opener;
		for (const id of this.ids) {
			const element = document.querySelector<HTMLElement>(this.#targets.row(id));
			if (element) return element;
		}
		return (
			(this.#group !== null
				? document.querySelector<HTMLElement>(this.#targets.group(this.#group))
				: null) ?? document.querySelector<HTMLElement>(this.#targets.fallback)
		);
	};
}

/**
 * Applies a change that can move a row to another group, where it is created anew (e.g. a
 * switch flipped in the list). If one of the row's inputs has focus, it is taken off first (zag
 * would otherwise handle the blur of a switch that no longer exists) and given to the same input
 * in the row's new place. `row` selects the row, e.g. `li[data-person="${id}"]`.
 */
export async function keepRowFocus(row: string, change: () => void) {
	const focused = document.activeElement;
	const inputs = () => [...document.querySelectorAll<HTMLInputElement>(`${row} input`)];
	const index = focused instanceof HTMLInputElement ? inputs().indexOf(focused) : -1;
	if (index >= 0) (focused as HTMLInputElement).blur();
	change();
	if (index < 0) return;
	await tick();
	inputs()[index]?.focus({ preventScroll: true });
}
