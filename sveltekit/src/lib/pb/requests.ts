// Request helpers shared by the editor pages (people, icons, calendar observances).
//
// Every request passes requestKey: null: the SDK otherwise cancels a pending request when another
// one with the same key starts (e.g. two quick switch flips, a reload during a save, or one usage
// count per row).
//
// Saves and deletes also give up after WRITE_TIMEOUT_MS: the SDK has no timeout of its own, and the
// dialogs stay locked while a save or delete is on its way, so a request that never gets an
// answer (e.g. the laptop's Wi-Fi dropped) must end as a "Can't reach PocketBase" error.
import { PUBLIC_POCKETBASE_URL } from '$app/env/public';
import { getPbImageUrl, pb } from '#lib/pb/index.ts';

/** Where the app looks for PocketBase (shown when it can't be reached). */
export const POCKETBASE_URL = PUBLIC_POCKETBASE_URL;

/** Long enough for a 5 MB picture on slow Wi-Fi. */
export const WRITE_TIMEOUT_MS = 30_000;

/** Options for every create, update and delete: `pb.collection(c).update(id, data, writeOptions())`. */
export const writeOptions = () => ({
	requestKey: null,
	signal: AbortSignal.timeout(WRITE_TIMEOUT_MS)
});

/** A new file to upload, null to remove the current one, undefined to leave it alone. */
export type FileChange = File | null | undefined;

/**
 * The fields to send, with the file field added when it changes: `withFile(fields, 'image', change)`.
 * PocketBase removes a file when the field is sent as null.
 */
export function withFile<T extends object>(
	fields: T,
	field: string,
	file: FileChange
): T & Record<string, File | null> {
	return (file === undefined ? { ...fields } : { ...fields, [field]: file }) as T &
		Record<string, File | null>;
}

/** How many records of `collection` match `filter` (one tiny request; no records are fetched). */
export async function countRecords(collection: string, filter: string): Promise<number> {
	const page = await pb.collection(collection).getList(1, 1, {
		filter,
		fields: 'id',
		requestKey: null
	});
	return page.totalItems;
}

/**
 * The URL of a file stored on a record ('' when `file` is empty). `thumb` asks PocketBase for a
 * smaller copy, e.g. '100x100' (always available; other sizes must be listed on the field).
 */
export function recordFileUrl(
	record: { collectionId: string; id: string },
	file: string | undefined,
	thumb?: string
): string {
	if (!file) return '';
	const url = getPbImageUrl(record.collectionId, record.id, file);
	return thumb ? `${url}?thumb=${thumb}` : url;
}
