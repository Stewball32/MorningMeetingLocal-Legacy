// The icon rows' switches in the page: keeping keyboard focus on one while its row moves between
// groups, and putting one back when its change is refused.
import { tick } from 'svelte';

const rowSelector = (id: string) => `li[data-icon="${CSS.escape(id)}"]`;

/**
 * Puts an icon's switch back after a flip the page refused (e.g. Guests for an icon without a
 * picture). The switch's look follows the icon, which didn't change, but the browser has already
 * toggled the checkbox behind it, and zag reads the next flip from that checkbox: without this,
 * the next click would be taken as switching it off.
 */
export function undoSwitchClick(id: string, field: string, checked: boolean) {
	for (const input of document.querySelectorAll<HTMLInputElement>(
		`${rowSelector(id)} input[name="${CSS.escape(field)}"]`
	))
		input.checked = checked;
}

/**
 * Applies a change that can move an icon's rows between groups (a switch flipped in the list). An
 * icon with several uses has a row in each of their groups, so this is keepRowFocus
 * (#lib/editor/focus.ts) aware of groups: if one of the icon's switches has focus, it is taken off
 * first (zag would otherwise handle the blur of a switch that no longer exists) and given to the
 * same switch (by its input's name) in the row of the same group or, when the row left that
 * group, in the icon's first row.
 */
export async function keepSwitchFocus(id: string, change: () => void) {
	const focused = document.activeElement;
	const row = focused instanceof HTMLInputElement ? focused.closest(rowSelector(id)) : null;
	if (!row || !(focused instanceof HTMLInputElement)) {
		change();
		return;
	}
	const name = focused.name;
	const group = row.closest<HTMLElement>('[data-group]')?.dataset.group;
	focused.blur();
	change();
	await tick();
	const input = (scope: string) =>
		document.querySelector<HTMLInputElement>(
			`${scope}${rowSelector(id)} input[name="${CSS.escape(name)}"]`
		);
	const target = (group ? input(`[data-group="${CSS.escape(group)}"] `) : null) ?? input('');
	target?.focus({ preventScroll: true });
}
