import { describe, expect, it } from 'vitest';
import {
	PICTURE_ACCEPT,
	PICTURE_MAX_BYTES,
	PICTURE_MAX_SIDE,
	pictureType,
	looksAnimated,
	planPicture,
	shrinkSides,
	SMALL_ENOUGH_BYTES,
	SMALL_PICTURE_SIDE,
	type PictureFacts
} from './picture.ts';

const MB = 1024 * 1024;
const facts = (more: Partial<PictureFacts>): PictureFacts => ({
	type: 'image/png',
	size: 200_000,
	width: 800,
	height: 600,
	animated: false,
	...more
});

describe('picture files', () => {
	it('accepts the image types the picture fields allow', () => {
		expect(PICTURE_ACCEPT).toBe('image/jpeg,image/png,image/svg+xml,image/gif,image/webp');
	});

	it('falls back to the file name when the browser gives no type', () => {
		expect(pictureType({ type: '', name: 'me.JPG' })).toBe('image/jpeg');
		expect(pictureType({ type: '', name: 'me.svg' })).toBe('image/svg+xml');
		expect(pictureType({ type: '', name: 'me' })).toBe('');
		expect(pictureType({ type: 'image/png', name: 'me.jpg' })).toBe('image/png');
	});
});

describe('planPicture', () => {
	it('takes small pictures as they are', () => {
		expect(planPicture(facts({}))).toEqual({ use: 'as-is' });
		expect(
			planPicture(facts({ type: 'image/gif', size: PICTURE_MAX_BYTES, animated: true }))
		).toEqual({ use: 'as-is' });
		expect(planPicture(facts({ width: PICTURE_MAX_SIDE, height: PICTURE_MAX_SIDE }))).toEqual({
			use: 'as-is'
		});
	});

	it('scales big photos down', () => {
		for (const type of ['image/jpeg', 'image/png', 'image/webp'])
			expect(planPicture(facts({ type, size: 8 * MB }))).toEqual({ use: 'smaller' });
	});

	it('scales pictures with too many pixels down, however few bytes they take', () => {
		expect(planPicture(facts({ size: 1 * MB, width: 16000, height: 16000 }))).toEqual({
			use: 'smaller'
		});
		expect(planPicture(facts({ type: 'image/jpeg', width: 2000, height: 3000 }))).toEqual({
			use: 'smaller'
		});
	});

	it('leaves a picture it cannot measure to PocketBase unless it is too big', () => {
		const unknown = { width: undefined, height: undefined };
		expect(planPicture(facts(unknown))).toEqual({ use: 'as-is' });
		expect(planPicture(facts({ ...unknown, size: 8 * MB }))).toEqual({ use: 'smaller' });
	});

	it('never flattens an animated picture', () => {
		const heavy = planPicture(facts({ type: 'image/webp', size: 9 * MB, animated: true }));
		expect('error' in heavy && heavy.error).toMatch(/9\.0 MB.*animat/);
		const large = planPicture(
			facts({ type: 'image/gif', width: 3000, height: 2000, animated: true })
		);
		expect(large).toEqual({ use: 'as-is' });
		const gif = planPicture(facts({ type: 'image/gif', size: 6 * MB, animated: true }));
		expect('error' in gif && gif.error).toMatch(/6\.0 MB/);
	});

	it('turns away animated PNGs, which PocketBase refuses', () => {
		const apng = planPicture(facts({ animated: true }));
		expect('error' in apng && apng.error).toMatch(/Animated PNG/);
	});

	it('keeps SVGs as they are, up to 5 MB', () => {
		const svg = { type: 'image/svg+xml', width: undefined, height: undefined };
		expect(planPicture(facts({ ...svg, size: 4 * MB }))).toEqual({ use: 'as-is' });
		expect(planPicture(facts({ ...svg, size: 6 * MB }))).toHaveProperty('error');
	});

	it('turns away other kinds of file', () => {
		expect(planPicture(facts({ type: 'application/pdf' }))).toHaveProperty('error');
		expect(planPicture(facts({ type: 'image/heic' }))).toHaveProperty('error');
	});

	it('scales still pictures down to a smaller side when asked (icons)', () => {
		const side = SMALL_PICTURE_SIDE;
		expect(side).toBe(640);
		// The default (people's pictures) leaves 800 x 600 alone; icons get a heavy one smaller.
		const heavy = { size: 900_000 };
		expect(planPicture(facts({ ...heavy, width: 800, height: 600 }))).toEqual({ use: 'as-is' });
		expect(planPicture(facts({ ...heavy, width: 800, height: 600 }), side)).toEqual({
			use: 'smaller'
		});
		expect(
			planPicture(facts({ ...heavy, type: 'image/webp', width: 600, height: 700 }), side)
		).toEqual({ use: 'smaller' });
		// A light one (up to 200 KB) within the usual 2000 px stays as it is: redrawing it saves
		// little, and PocketBase can still make list thumbnails of a PNG or JPEG.
		expect(
			planPicture(facts({ size: SMALL_ENOUGH_BYTES, width: 1200, height: 1200 }), side)
		).toEqual({ use: 'as-is' });
		expect(
			planPicture(facts({ size: SMALL_ENOUGH_BYTES + 1, width: 1200, height: 1200 }), side)
		).toEqual({ use: 'smaller' });
		expect(planPicture(facts({ size: 50_000, width: 2600, height: 2600 }), side)).toEqual({
			use: 'smaller'
		});
		expect(planPicture(facts({ width: side, height: side }), side)).toEqual({ use: 'as-is' });
		expect(planPicture(facts({ width: 300, height: 300 }), side)).toEqual({ use: 'as-is' });
		// Animated pictures and SVGs stay as they are: redrawing would stop them moving or blur them.
		expect(
			planPicture(facts({ type: 'image/gif', width: 900, height: 900, animated: true }), side)
		).toEqual({ use: 'as-is' });
		const svg = { type: 'image/svg+xml', width: undefined, height: undefined };
		expect(planPicture(facts(svg), side)).toEqual({ use: 'as-is' });
	});
});

describe('shrinkSides', () => {
	it("tries 1600 then 1000 by default (people's pictures)", () => {
		expect(shrinkSides()).toEqual([1600, 1000]);
	});

	it('tries the side asked for, then the smaller default ones', () => {
		expect(shrinkSides(SMALL_PICTURE_SIDE)).toEqual([640]);
		expect(shrinkSides(1200)).toEqual([1200, 1000]);
	});
});

describe('looksAnimated', () => {
	const bytes = (...parts: (string | number[])[]) =>
		new Uint8Array(
			parts.flatMap((part) =>
				typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part
			)
		);
	const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
	const chunk = (type: string, length: number) => [
		...u32(length),
		...[...type].map((c) => c.charCodeAt(0)),
		...new Array(length + 4).fill(0)
	];
	const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

	it('treats every GIF as possibly animated', () => {
		expect(looksAnimated('image/gif', bytes('GIF89a'))).toBe(true);
	});

	it('finds the acTL chunk of an animated PNG', () => {
		const apng = bytes(PNG_SIGNATURE, chunk('IHDR', 13), chunk('acTL', 8), chunk('IDAT', 20));
		expect(looksAnimated('image/png', apng)).toBe(true);
		const still = bytes(PNG_SIGNATURE, chunk('IHDR', 13), chunk('tEXt', 30), chunk('IDAT', 20));
		expect(looksAnimated('image/png', still)).toBe(false);
		// acTL after the image data doesn't count (and a cut-off file isn't animated).
		expect(looksAnimated('image/png', bytes(PNG_SIGNATURE, chunk('IHDR', 13)))).toBe(false);
	});

	it("reads a WebP's animation flag", () => {
		const webp = (flags: number) =>
			bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8X', [10, 0, 0, 0], [flags, 0, 0, 0]);
		expect(looksAnimated('image/webp', webp(0x02))).toBe(true);
		expect(looksAnimated('image/webp', webp(0x10))).toBe(false); // alpha only
		expect(looksAnimated('image/webp', bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8 '))).toBe(false);
	});

	it('takes JPEGs as still', () => {
		expect(looksAnimated('image/jpeg', bytes([0xff, 0xd8, 0xff]))).toBe(false);
	});
});
