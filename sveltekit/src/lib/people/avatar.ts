// Picture uploads. The people.avatar field takes these image types; PocketBase caps a file at
// 5 MB when the field sets no size (maxSize 0), which a phone photo can easily pass, so big
// photos are scaled down in the browser before they are sent.

export const AVATAR_TYPES = [
	'image/jpeg',
	'image/png',
	'image/svg+xml',
	'image/gif',
	'image/webp'
] as const;
/** For <input type="file" accept=...>. */
export const AVATAR_ACCEPT = AVATAR_TYPES.join(',');
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

const EXTENSION_TYPES: Record<string, (typeof AVATAR_TYPES)[number]> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	svg: 'image/svg+xml',
	gif: 'image/gif',
	webp: 'image/webp'
};
/** Photos that can be redrawn smaller without losing anything that matters (not GIF or SVG). */
const SHRINKABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** The file's image type, from the browser or (when it gives none) the file name. */
export function avatarType(file: Pick<File, 'type' | 'name'>): string {
	if (file.type) return file.type;
	const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
	return EXTENSION_TYPES[extension] ?? '';
}

export const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export type AvatarCheck = { ok: true; shrink: boolean } | { ok: false; error: string };

export function checkAvatar(file: Pick<File, 'type' | 'name' | 'size'>): AvatarCheck {
	const type = avatarType(file);
	if (!(AVATAR_TYPES as readonly string[]).includes(type))
		return { ok: false, error: 'Please choose a JPEG, PNG, WebP, GIF or SVG picture.' };
	if (file.size <= AVATAR_MAX_BYTES) return { ok: true, shrink: false };
	if (SHRINKABLE.has(type)) return { ok: true, shrink: true };
	return {
		ok: false,
		error: `That picture is ${megabytes(file.size)}; pictures can be up to ${megabytes(AVATAR_MAX_BYTES)}. Please choose a smaller one.`
	};
}

/** Redraws a photo at most `maxSide` pixels wide/high as WebP (which keeps transparency). */
async function shrink(file: File, maxSide: number): Promise<File | null> {
	const bitmap = await createImageBitmap(file);
	try {
		const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));
		canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/webp', 0.9)
		);
		if (!blob) return null;
		// A browser without a WebP encoder hands back a PNG instead.
		const extension = blob.type === 'image/webp' ? 'webp' : 'png';
		const name = `${file.name.replace(/\.[^.]*$/, '') || 'picture'}.${extension}`;
		return new File([blob], name, { type: blob.type || 'image/png' });
	} finally {
		bitmap.close();
	}
}

/** Checks a chosen picture and scales big photos down; resolves to the file to upload. */
export async function prepareAvatar(file: File): Promise<{ file: File } | { error: string }> {
	const check = checkAvatar(file);
	if (!check.ok) return { error: check.error };
	if (!check.shrink) return { file };
	try {
		for (const side of [1600, 1000]) {
			const smaller = await shrink(file, side);
			if (smaller && smaller.size <= AVATAR_MAX_BYTES) return { file: smaller };
		}
	} catch (error) {
		console.error('Could not scale the picture down', error);
	}
	return {
		error: `That picture is ${megabytes(file.size)} and couldn't be made smaller here; pictures can be up to ${megabytes(AVATAR_MAX_BYTES)}.`
	};
}
