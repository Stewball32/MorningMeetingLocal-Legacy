// PocketBase access for the Icons page (/icons): list, create, update and delete icons, and count
// what uses an icon before it is deleted. The page follows changes live through LiveList
// (#lib/editor/live-list.svelte.ts); the request options are explained in requests.ts.
import { pb } from '#lib/pb/index.ts';
import {
	countRecords,
	recordFileUrl,
	withFile,
	writeOptions,
	type FileChange
} from './requests.ts';
import type { IconRecord } from './types.ts';
import type { IconFields } from '#lib/icons/form.ts';
import { USES, type UseCounts } from '#lib/icons/uses.ts';

export const ICONS = 'icons';

/** Every icon, sorted by name like the slides. */
export function listIcons(): Promise<IconRecord[]> {
	return pb.collection(ICONS).getFullList<IconRecord>({ sort: 'name', requestKey: null });
}

export function createIcon(fields: IconFields, image?: File | null): Promise<IconRecord> {
	return pb
		.collection(ICONS)
		.create<IconRecord>(withFile(fields, 'image', image ?? undefined), writeOptions());
}

/** `image`: a new picture, null to remove it, undefined to leave it alone. */
export function updateIcon(
	id: string,
	fields: Partial<IconFields>,
	image?: FileChange
): Promise<IconRecord> {
	return pb
		.collection(ICONS)
		.update<IconRecord>(id, withFile(fields, 'image', image), writeOptions());
}

/**
 * Permanent, picture included. PocketBase clears the icon from whatever used it (guest check-ins'
 * `avatar`, observances' `icon`): those relations don't cascade.
 */
export function deleteIcon(id: string): Promise<boolean> {
	return pb.collection(ICONS).delete(id, writeOptions());
}

/** Counts the records that use the icon, for each use (see USES). */
export async function countIconUses(id: string): Promise<UseCounts> {
	const counts = await Promise.all(
		USES.map(({ usedBy }) =>
			countRecords(usedBy.collection, pb.filter(`${usedBy.field} = {:id}`, { id }))
		)
	);
	return Object.fromEntries(USES.map((use, index) => [use.key, counts[index]])) as UseCounts;
}

/**
 * The URL of the icon's picture ('' when it has none). `thumb: '100x100'` asks PocketBase for a
 * small square copy, for the list.
 */
export function iconPictureUrl(
	icon: Pick<IconRecord, 'collectionId' | 'id' | 'image'>,
	thumb?: '100x100'
): string {
	return recordFileUrl(icon, icon.image, thumb);
}
