// Picture uploads. The people.avatar field takes these image types; PocketBase caps a file at
// 5 MB when the field sets no size (maxSize 0), which a phone photo can easily pass. Big photos
// are scaled down in the browser before they are sent: over 5 MB, or more pixels than any
// screen shows them at (a small file can hold a huge picture that every slide would then have
// to decode).

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
/** Pictures wider or higher than this are scaled down, however few bytes they take. */
export const AVATAR_MAX_SIDE = 2000;
/** The longer side a scaled-down picture gets (the next one if that is still over 5 MB). */
const SHRINK_SIDES = [1600, 1000];

const EXTENSION_TYPES: Record<string, (typeof AVATAR_TYPES)[number]> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	svg: 'image/svg+xml',
	gif: 'image/gif',
	webp: 'image/webp'
};

/** The file's image type, from the browser or (when it gives none) the file name. */
export function avatarType(file: Pick<File, 'type' | 'name'>): string {
	if (file.type) return file.type;
	const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
	return EXTENSION_TYPES[extension] ?? '';
}

export const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** What is known about a chosen picture. */
export interface AvatarFacts {
	type: string;
	/** in bytes */
	size: number;
	/** As shown (EXIF rotation applied); unknown if the browser couldn't read the picture. */
	width?: number;
	height?: number;
	/** Could move: redrawing it smaller would leave a still picture. */
	animated: boolean;
}

export type AvatarPlan = { use: 'as-is' | 'smaller' } | { error: string };

const TYPE_ERROR = 'Please choose a JPEG, PNG, WebP, GIF or SVG picture.';
const APNG_ERROR =
	"Animated PNG pictures can't be used. Please choose an animated GIF or WebP, or a still picture.";

/** Whether a picture can be used as it is, must be scaled down first, or can't be used. */
export function planAvatar({ type, size, width, height, animated }: AvatarFacts): AvatarPlan {
	if (!(AVATAR_TYPES as readonly string[]).includes(type)) return { error: TYPE_ERROR };
	const tooHeavy = size > AVATAR_MAX_BYTES;
	const tooBig = Math.max(width ?? 0, height ?? 0) > AVATAR_MAX_SIDE;
	const limits = `pictures can be up to ${megabytes(AVATAR_MAX_BYTES)}`;
	// An SVG is drawn sharp at any size, so only its bytes count; it is never redrawn.
	if (type === 'image/svg+xml')
		return tooHeavy
			? { error: `That picture is ${megabytes(size)}; ${limits}. Please choose a smaller one.` }
			: { use: 'as-is' };
	// PocketBase sees an animated PNG as another file type and refuses it.
	if (type === 'image/png' && animated) return { error: APNG_ERROR };
	if (!tooHeavy && !tooBig) return { use: 'as-is' };
	if (animated) {
		const what = tooHeavy ? megabytes(size) : `${width} × ${height} pixels`;
		return {
			error: `That picture is ${what}; GIF and animated pictures can be up to ${megabytes(AVATAR_MAX_BYTES)} and ${AVATAR_MAX_SIDE} pixels wide and high (making them smaller here would stop the animation). Please choose a smaller one.`
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

/** Checks a chosen picture and scales big photos down; resolves to the file to upload. */
export async function prepareAvatar(file: File): Promise<{ file: File } | { error: string }> {
	const type = avatarType(file);
	if (!(AVATAR_TYPES as readonly string[]).includes(type)) return { error: TYPE_ERROR };
	const svg = type === 'image/svg+xml';
	const head = svg ? new Uint8Array() : new Uint8Array(await file.slice(0, 1 << 20).arrayBuffer());
	const size = svg ? null : await readSize(file);
	const plan = planAvatar({
		type,
		size: file.size,
		width: size?.width,
		height: size?.height,
		animated: looksAnimated(type, head)
	});
	if ('error' in plan) return plan;
	if (plan.use === 'as-is') return { file };
	try {
		// A picture the browser can't read can't be redrawn either.
		if (size) {
			for (const side of SHRINK_SIDES) {
				const smaller = await shrink(file, size, side);
				if (smaller && smaller.size <= AVATAR_MAX_BYTES) return { file: smaller };
			}
		}
	} catch (error) {
		console.error('Could not scale the picture down', error);
	}
	const what = size
		? `${megabytes(file.size)}, ${size.width} × ${size.height} pixels`
		: megabytes(file.size);
	return {
		error: `That picture (${what}) couldn't be made smaller here; pictures can be up to ${megabytes(AVATAR_MAX_BYTES)} and ${AVATAR_MAX_SIDE} pixels wide and high.`
	};
}
