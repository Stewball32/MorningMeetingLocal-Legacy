// Pure helpers for the Icons page: grouping the list, and the words for uses and deletes.
import { validationCodes, type DescribeOptions } from '#lib/editor/errors.ts';
import { compareByName, plural } from '#lib/editor/list.ts';
import type { IconRecord } from '#lib/pb/types.ts';
import { USES, useOf, usesOf, type UseCounts, type UseField, type UseKey } from './uses.ts';

/** For describeError: "this icon no longer exists. It may have been deleted ..." */
export const ICON_ERRORS = { noun: 'icon', pronoun: 'It' } satisfies DescribeOptions;

/** What the slides show instead of an icon without a picture, on a guest button and in a calendar day. */
export const GUEST_DEFAULT_PICTURE = '/defaults/avatar.png';
export const CALENDAR_DEFAULT_PICTURE = '/defaults/calendar.png';

/** A group of the list: one per use, plus 'unused' for icons with every switch off. */
export type GroupKey = UseKey | 'unused';
export type IconGroups = Record<GroupKey, IconRecord[]>;

/**
 * Splits icons into the list's groups, each sorted by name like the slides. An icon with several
 * switches on is in each of those groups (the "For guests" group then lists exactly what Add Guest
 * offers, and "For the calendar" what the observances' picker offers).
 */
export function groupIcons(icons: readonly IconRecord[]): IconGroups {
	const groups = Object.fromEntries([
		...USES.map((use) => [use.key, [] as IconRecord[]]),
		['unused', [] as IconRecord[]]
	]) as IconGroups;
	for (const icon of icons) {
		const uses = usesOf(icon);
		if (uses.length === 0) groups.unused.push(icon);
		for (const use of uses) groups[use.key as UseKey].push(icon);
	}
	for (const list of Object.values(groups)) list.sort(compareByName);
	return groups;
}

/** "Rocket 🚀": how the icon is named in messages and dialog titles. */
export function iconLabel(icon: Pick<IconRecord, 'name' | 'emoji'>): string {
	return `${icon.name} ${icon.emoji ?? ''}`.trim();
}

/** Whether the icon is on for guests without a picture: guest buttons would show a broken image. */
export function needsPicture(icon: Pick<IconRecord, 'for_guests' | 'image'>): boolean {
	return !!icon.for_guests && !icon.image;
}

/**
 * What uses an icon, in words, leaving out what nothing uses: ["12 guest check-ins",
 * "1 calendar observance"].
 */
export function usageParts(counts: UseCounts): string[] {
	return USES.flatMap((use) => {
		const count = counts[use.key];
		return count > 0 ? [plural(count, use.usedBy.thing)] : [];
	});
}

/** Joins ["a", "b", "c"] as "a, b and c" (or "a, b or c"). */
export function joinWords(words: readonly string[], conjunction: 'and' | 'or' = 'and'): string {
	if (words.length <= 1) return words.join('');
	return `${words.slice(0, -1).join(', ')} ${conjunction} ${words.at(-1)}`;
}

/** The total of all uses. */
export function totalUses(counts: UseCounts): number {
	return USES.reduce((total, use) => total + counts[use.key], 0);
}

/** What happens to the records that use the icon when it is deleted (only the uses with any). */
export function afterDelete(counts: UseCounts | null): string[] {
	return USES.filter((use) => !counts || counts[use.key] > 0).map((use) => use.usedBy.afterDelete);
}

/** The message after one of an icon's switches was saved in the list. */
export function switchMessage(icon: Pick<IconRecord, 'name' | UseField>, field: UseField): string {
	const use = useOf(field);
	return icon[field] ? use.turnedOn(icon.name) : use.turnedOff(icon.name);
}

/** The message after "Turn off instead" switched these uses off. */
export function turnedOffMessage(name: string, fields: readonly UseField[]): string {
	const uses = USES.filter((use) => fields.includes(use.field));
	if (uses.length === 0) return `${name} was already turned off.`;
	const groups = joinWords(
		uses.map((use) => use.group.toLowerCase()),
		'or'
	);
	return `Turned off ${name}: no longer offered ${groups}. Everything that used it keeps its picture.`;
}

/**
 * Whether PocketBase refused to delete an icon because clearing it from the guest check-ins that
 * used it would leave two same-named one-off guests on one day without an icon, which the old
 * unique index on guest_dailies refused. The icons_and_observances migration makes that index
 * skip check-ins without an icon, so this only happens on a PocketBase without that update.
 */
export function isDeleteClash(error: unknown): boolean {
	return Object.values(validationCodes(error)).includes('validation_not_unique');
}

/** Completes "Couldn't delete Rocket: ..." for isDeleteClash. */
export const DELETE_CLASH =
	"two guests with the same name who checked in on the same day would both be left without an icon, which this PocketBase doesn't allow yet (it needs the latest update). Turn the icon off instead.";
