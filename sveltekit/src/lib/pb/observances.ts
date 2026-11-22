// PocketBase access for the Calendar Observances editor (/calendar): list, create, update and
// delete observances, and list the icons they can use. The page follows both collections live
// through LiveList (#lib/editor/live-list.svelte.ts); the request options are explained in
// requests.ts. What the slide makes of the records is in calendar.ts.
import { pb } from '#lib/pb/index.ts';
import { ICONS, isSettingsRecord, OBSERVANCES } from './calendar.ts';
import { recordFileUrl, withFile, writeOptions, type FileChange } from './requests.ts';
import type { CalendarObservance, IconRecord } from '#lib/pb/types.ts';
import type { ObservanceFields } from '#lib/observances/form.ts';

export { ICONS, OBSERVANCES };

/** Every observance, active or not, with its icon (`expand.icon`). */
export function listObservances(): Promise<CalendarObservance[]> {
	return pb
		.collection(OBSERVANCES)
		.getFullList<CalendarObservance>({ expand: 'icon', requestKey: null });
}

/** Every icon, sorted by name like the slides (the picker offers those with Calendar on first). */
export function listIcons(): Promise<IconRecord[]> {
	return pb.collection(ICONS).getFullList<IconRecord>({ sort: 'name', requestKey: null });
}

const saveOptions = () => ({ ...writeOptions(), expand: 'icon' });

export function createObservance(
	fields: ObservanceFields,
	image?: File | null
): Promise<CalendarObservance> {
	return pb
		.collection(OBSERVANCES)
		.create<CalendarObservance>(withFile(fields, 'image', image ?? undefined), saveOptions());
}

export function updateObservance(
	id: string,
	fields: Partial<ObservanceFields>,
	image?: FileChange
): Promise<CalendarObservance> {
	return pb
		.collection(OBSERVANCES)
		.update<CalendarObservance>(id, withFile(fields, 'image', image), saveOptions());
}

/** Permanent (nothing else refers to an observance). */
export function deleteObservance(id: string): Promise<boolean> {
	return pb.collection(OBSERVANCES).delete(id, writeOptions());
}

/** The settings records for the built-in holidays (no dates), fresh from PocketBase. */
export async function listSettingsRecords(): Promise<CalendarObservance[]> {
	return (await listObservances()).filter(isSettingsRecord);
}

/** The URL of an icon's picture ('' when it has none); `thumb` e.g. '100x100'. */
export const iconPictureUrl = (icon: IconRecord, thumb?: string) =>
	recordFileUrl(icon, icon.image, thumb);

/** The URL of an observance's own picture ('' when it has none). */
export const observanceImageUrl = (record: CalendarObservance, thumb?: string) =>
	recordFileUrl(record, record.image, thumb);
