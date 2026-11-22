import { describe, expect, it } from 'vitest';
import { AVATAR_ACCEPT, AVATAR_MAX_BYTES, avatarType, checkAvatar } from './avatar.ts';

const MB = 1024 * 1024;

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

	it('takes small pictures as they are', () => {
		expect(checkAvatar({ type: 'image/png', name: 'a.png', size: 200_000 })).toEqual({
			ok: true,
			shrink: false
		});
		expect(checkAvatar({ type: 'image/gif', name: 'a.gif', size: AVATAR_MAX_BYTES })).toEqual({
			ok: true,
			shrink: false
		});
	});

	it('scales big photos down', () => {
		for (const type of ['image/jpeg', 'image/png', 'image/webp'])
			expect(checkAvatar({ type, name: 'photo', size: 8 * MB })).toEqual({
				ok: true,
				shrink: true
			});
	});

	it('turns away big GIFs and SVGs, and other kinds of file', () => {
		const gif = checkAvatar({ type: 'image/gif', name: 'a.gif', size: 6 * MB });
		expect(gif.ok).toBe(false);
		if (!gif.ok) expect(gif.error).toMatch(/6\.0 MB/);
		expect(checkAvatar({ type: 'application/pdf', name: 'a.pdf', size: 10 }).ok).toBe(false);
		expect(checkAvatar({ type: 'image/heic', name: 'a.heic', size: 10 }).ok).toBe(false);
	});
});
