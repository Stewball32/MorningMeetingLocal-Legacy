// Picture uploads for the editor pages (use it through PicturePicker.svelte). The picture fields
// (people.avatar, icons.image, calendar_observances.image) take these image types; PocketBase
// caps a file at 5 MB when the field sets no size (maxSize 0), which a phone photo can easily
// pass. Big photos are scaled down in the browser before they are sent: over 5 MB, or more pixels
// than any screen shows them at (a small file can hold a huge picture that every slide would then
// have to decode), or than a picture shown small needs (SMALL_PICTURE_SIDE, for icons). Animated
// GIF/WebP are kept as they are (up to 5 MB); animated PNG is refused.

export const PICTURE_TYPES = [
	'image/jpeg',
	'image/png',
	'image/svg+xml',
	'image/gif',
	'image/webp'
] as const;
/** For <input type="file" accept=...>. */
export const PICTURE_ACCEPT = PICTURE_TYPES.join(',');
export const PICTURE_MAX_BYTES = 5 * 1024 * 1024;
/** Pictures wider or higher than this are scaled down, however few bytes they take. */
export const PICTURE_MAX_SIDE = 2000;
/** With a smaller maxSide, a still up to this many bytes is kept as it is (see planPicture). */
export const SMALL_ENOUGH_BYTES = 200 * 1024;
/** The longer side a scaled-down picture gets (the next one if that is still over 5 MB). */
const SHRINK_SIDES = [1600, 1000];
/**
 * The longest side for pictures that are only ever shown small (PicturePicker's `maxSide`): icons
 * (guest buttons, calendar day cells and the Icons list, 64-300 CSS pixels) and an observance's
 * own picture (a calendar day cell). 640 stays sharp on a 2x screen. PocketBase 0.26 makes no
 * ?thumb= copies of WebP, the format scaled pictures are saved in, so a 1600-pixel one would be
 * downloaded in full wherever it is shown.
 */
export const SMALL_PICTURE_SIDE = 640;

/**
 * The longer sides to try when scaling a picture down, biggest first: `maxSide`, else 1600 (and
 * 1000 if that is still over 5 MB).
 */
export function shrinkSides(maxSide?: number): number[] {
	if (maxSide === undefined) return SHRINK_SIDES;
	return [maxSide, ...SHRINK_SIDES.filter((side) => side < maxSide)];
}

const EXTENSION_TYPES: Record<string, (typeof PICTURE_TYPES)[number]> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	svg: 'image/svg+xml',
	gif: 'image/gif',
	webp: 'image/webp'
};

/** The file's image type, from the browser or (when it gives none) the file name. */
export function pictureType(file: Pick<File, 'type' | 'name'>): string {
	if (file.type) return file.type;
	const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
	return EXTENSION_TYPES[extension] ?? '';
}

export const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** What is known about a chosen picture. */
export interface PictureFacts {
	type: string;
	/** in bytes */
	size: number;
	/** As shown (EXIF rotation applied); unknown if the browser couldn't read the picture. */
	width?: number;
	height?: number;
	/** Could move: redrawing it smaller would leave a still picture. */
	animated: boolean;
}

export type PicturePlan = { use: 'as-is' | 'smaller' } | { error: string };

const TYPE_ERROR = 'Please choose a JPEG, PNG, WebP, GIF or SVG picture.';
const APNG_ERROR =
	"Animated PNG pictures can't be used. Please choose an animated GIF or WebP, or a still picture.";

/**
 * Whether a picture can be used as it is, must be scaled down first, or can't be used. `maxSide`:
 * still pictures wider or higher than this are scaled down (default PICTURE_MAX_SIDE).
 */
export function planPicture(
	{ type, size, width, height, animated }: PictureFacts,
	maxSide = PICTURE_MAX_SIDE
): PicturePlan {
	if (!(PICTURE_TYPES as readonly string[]).includes(type)) return { error: TYPE_ERROR };
	const tooHeavy = size > PICTURE_MAX_BYTES;
	const tooBig = Math.max(width ?? 0, height ?? 0) > maxSide;
	const limits = `pictures can be up to ${megabytes(PICTURE_MAX_BYTES)}`;
	// An SVG is drawn sharp at any size, so only its bytes count; it is never redrawn.
	if (type === 'image/svg+xml')
		return tooHeavy
			? { error: `That picture is ${megabytes(size)}; ${limits}. Please choose a smaller one.` }
			: { use: 'as-is' };
	// PocketBase sees an animated PNG as another file type and refuses it.
	if (type === 'image/png' && animated) return { error: APNG_ERROR };
	if (!tooHeavy && !tooBig) return { use: 'as-is' };
	// With a smaller maxSide (pictures shown small): a light still within the usual limit is kept as
	// it is. Redrawing it wouldn't save much, and PocketBase can still make list thumbnails of a
	// JPEG or PNG (it can't for WebP, which a redrawn picture becomes).
	if (
		!animated &&
		size <= SMALL_ENOUGH_BYTES &&
		Math.max(width ?? 0, height ?? 0) <= PICTURE_MAX_SIDE
	)
		return { use: 'as-is' };
	// Redrawing a GIF or an animated WebP smaller would stop it moving: within the size in bytes it
	// is uploaded as it is, however many pixels it has (as before the editor scaled pictures).
	if (animated) {
		if (!tooHeavy) return { use: 'as-is' };
		return {
			error: `That picture is ${megabytes(size)}; GIF and animated pictures can be up to ${megabytes(PICTURE_MAX_BYTES)} (making them smaller here would stop the animation). Please choose a smaller one.`
		};
	}
	return { use: 'smaller' };
}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
	String.fromCharCode(...bytes.subarray(start, start + length));

/**
 * Whether a picture may be animated, from the start of its file: every GIF (one frame or many),
 * a WebP with the animation flag, a PNG with an acTL chunk before its image data (APNG).
 */
export function looksAnimated(type: string, head: Uint8Array): boolean {
	if (type === 'image/gif') return true;
	if (type === 'image/webp')
		return (
			ascii(head, 0, 4) === 'RIFF' &&
			ascii(head, 8, 4) === 'WEBP' &&
			ascii(head, 12, 4) === 'VP8X' &&
			((head[20] ?? 0) & 0x02) !== 0
		);
	if (type === 'image/png') {
		const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
		// After the 8-byte signature, chunks: length (4), type (4), data, CRC (4).
		for (let at = 8; at + 8 <= head.byteLength; at += 12 + view.getUint32(at)) {
			const chunk = ascii(head, at + 4, 4);
			if (chunk === 'acTL') return true;
			if (chunk === 'IDAT') return false;
		}
	}
	return false;
}

/** The picture's size as shown (EXIF rotation applied), or null if the browser can't read it. */
function readSize(file: Blob): Promise<{ width: number; height: number } | null> {
	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const image = new Image();
		const done = (size: { width: number; height: number } | null) => {
			URL.revokeObjectURL(url);
			resolve(size);
		};
		image.onload = () =>
			done(
				image.naturalWidth > 0 && image.naturalHeight > 0
					? { width: image.naturalWidth, height: image.naturalHeight }
					: null
			);
		image.onerror = () => done(null);
		image.src = url;
	});
}

/** Redraws a photo at most `maxSide` pixels wide/high as WebP (which keeps transparency). */
async function shrink(
	file: File,
	size: { width: number; height: number },
	maxSide: number
): Promise<File | null> {
	const scale = Math.min(1, maxSide / Math.max(size.width, size.height));
	const width = Math.max(1, Math.round(size.width * scale));
	const height = Math.max(1, Math.round(size.height * scale));
	// Decoding straight to the smaller size spares the memory of a full-size copy (a 16000 x 16000
	// picture would need 1 GB). EXIF rotation is applied first, like naturalWidth/Height.
	const bitmap = await createImageBitmap(file, {
		resizeWidth: width,
		resizeHeight: height,
		resizeQuality: 'high'
	});
	try {
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
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

/**
 * Checks a chosen picture and scales big photos down; resolves to the file to upload, or to a
 * message for the teacher. `maxSide`: scale still pictures down to at most this many pixels wide
 * and high (e.g. SMALL_PICTURE_SIDE); by default only pictures over PICTURE_MAX_SIDE, to 1600.
 */
export async function preparePicture(
	file: File,
	{ maxSide }: { maxSide?: number } = {}
): Promise<{ file: File } | { error: string }> {
	const type = pictureType(file);
	if (!(PICTURE_TYPES as readonly string[]).includes(type)) return { error: TYPE_ERROR };
	const svg = type === 'image/svg+xml';
	const head = svg ? new Uint8Array() : new Uint8Array(await file.slice(0, 1 << 20).arrayBuffer());
	const size = svg ? null : await readSize(file);
	const plan = planPicture(
		{
			type,
			size: file.size,
			width: size?.width,
			height: size?.height,
			animated: looksAnimated(type, head)
		},
		maxSide
	);
	if ('error' in plan) return plan;
	if (plan.use === 'as-is') return { file };
	try {
		// A picture the browser can't read can't be redrawn either.
		if (size) {
			for (const side of shrinkSides(maxSide)) {
				const smaller = await shrink(file, size, side);
				if (smaller && smaller.size <= PICTURE_MAX_BYTES) return { file: smaller };
			}
		}
	} catch (error) {
		console.error('Could not scale the picture down', error);
	}
	const what = size
		? `${megabytes(file.size)}, ${size.width} × ${size.height} pixels`
		: megabytes(file.size);
	return {
		error: `That picture (${what}) couldn't be made smaller here; pictures can be up to ${megabytes(PICTURE_MAX_BYTES)} and ${maxSide ?? PICTURE_MAX_SIDE} pixels wide and high.`
	};
}
