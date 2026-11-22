import { describe, expect, it } from 'vitest';
import {
	AVATAR_ACCEPT,
	AVATAR_MAX_BYTES,
	AVATAR_MAX_SIDE,
	avatarType,
	looksAnimated,
	planAvatar,
	type AvatarFacts
} from './avatar.ts';

const MB = 1024 * 1024;
const facts = (more: Partial<AvatarFacts>): AvatarFacts => ({
	type: 'image/png',
	size: 200_000,
	width: 800,
	height: 600,
	animated: false,
	...more
});

describe('avatar files', () => {
	it('accepts the image types the people.avatar field allows', () => {
		expect(AVATAR_ACCEPT).toBe('image/jpeg,image/png,image/svg+xml,image/gif,image/webp');
	});

	it('falls back to the file name when the browser gives no type', () => {
		expect(avatarType({ type: '', name: 'me.JPG' })).toBe('image/jpeg');
		expect(avatarType({ type: '', name: 'me.svg' })).toBe('image/svg+xml');
		expect(avatarType({ type: '', name: 'me' })).toBe('');
		expect(avatarType({ type: 'image/png', name: 'me.jpg' })).toBe('image/png');
	});
});

describe('planAvatar', () => {
	it('takes small pictures as they are', () => {
		expect(planAvatar(facts({}))).toEqual({ use: 'as-is' });
		expect(
			planAvatar(facts({ type: 'image/gif', size: AVATAR_MAX_BYTES, animated: true }))
		).toEqual({ use: 'as-is' });
		expect(planAvatar(facts({ width: AVATAR_MAX_SIDE, height: AVATAR_MAX_SIDE }))).toEqual({
			use: 'as-is'
		});
	});

	it('scales big photos down', () => {
		for (const type of ['image/jpeg', 'image/png', 'image/webp'])
			expect(planAvatar(facts({ type, size: 8 * MB }))).toEqual({ use: 'smaller' });
	});

	it('scales pictures with too many pixels down, however few bytes they take', () => {
		expect(planAvatar(facts({ size: 1 * MB, width: 16000, height: 16000 }))).toEqual({
			use: 'smaller'
		});
		expect(planAvatar(facts({ type: 'image/jpeg', width: 2000, height: 3000 }))).toEqual({
			use: 'smaller'
		});
	});

	it('leaves a picture it cannot measure to PocketBase unless it is too big', () => {
		const unknown = { width: undefined, height: undefined };
		expect(planAvatar(facts(unknown))).toEqual({ use: 'as-is' });
		expect(planAvatar(facts({ ...unknown, size: 8 * MB }))).toEqual({ use: 'smaller' });
	});

	it('never flattens an animated picture', () => {
		const heavy = planAvatar(facts({ type: 'image/webp', size: 9 * MB, animated: true }));
		expect('error' in heavy && heavy.error).toMatch(/9\.0 MB.*animat/);
		const large = planAvatar(
			facts({ type: 'image/gif', width: 3000, height: 2000, animated: true })
		);
		expect(large).toEqual({ use: 'as-is' });
		const gif = planAvatar(facts({ type: 'image/gif', size: 6 * MB, animated: true }));
		expect('error' in gif && gif.error).toMatch(/6\.0 MB/);
	});

	it('turns away animated PNGs, which PocketBase refuses', () => {
		const apng = planAvatar(facts({ animated: true }));
		expect('error' in apng && apng.error).toMatch(/Animated PNG/);
	});

	it('keeps SVGs as they are, up to 5 MB', () => {
		const svg = { type: 'image/svg+xml', width: undefined, height: undefined };
		expect(planAvatar(facts({ ...svg, size: 4 * MB }))).toEqual({ use: 'as-is' });
		expect(planAvatar(facts({ ...svg, size: 6 * MB }))).toHaveProperty('error');
	});

	it('turns away other kinds of file', () => {
		expect(planAvatar(facts({ type: 'application/pdf' }))).toHaveProperty('error');
		expect(planAvatar(facts({ type: 'image/heic' }))).toHaveProperty('error');
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
