import { describe, expect, it } from 'vitest';
import { EMOJI_PALETTE, emojiProblem, graphemes, roughGraphemes } from './emoji.ts';

// Emoji made of several code points, written out so the test shows what they are made of.
const TEACHER = '\u{1F469}\u200D\u{1F3EB}'; // woman + ZWJ + school
const FLAG_US = '\u{1F1FA}\u{1F1F8}'; // two regional indicators
const THUMBS_MEDIUM = '\u{1F44D}\u{1F3FD}'; // thumbs up + skin tone
const KEYCAP_ONE = '1\uFE0F\u20E3'; // digit + VS16 + keycap
const RAINBOW_FLAG = '\u{1F3F3}\uFE0F\u200D\u{1F308}';
const HEART = '❤\uFE0F';
const E_ACUTE = 'e\u0301'; // e + combining acute accent
const ENGLAND = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}'; // tag sequence

const SINGLES = [
	TEACHER,
	FLAG_US,
	THUMBS_MEDIUM,
	KEYCAP_ONE,
	RAINBOW_FLAG,
	HEART,
	E_ACUTE,
	ENGLAND
];

describe('graphemes', () => {
	it('counts an emoji sequence as one character', () => {
		for (const single of [...SINGLES, '🐐', 'A']) expect(graphemes(single)).toEqual([single]);
	});

	it('splits several', () => {
		expect(graphemes('🐐🐐')).toEqual(['🐐', '🐐']);
		expect(graphemes(`${FLAG_US}${FLAG_US}`)).toEqual([FLAG_US, FLAG_US]);
		expect(graphemes(`${TEACHER} ${HEART}`)).toEqual([TEACHER, ' ', HEART]);
		expect(graphemes('ab')).toEqual(['a', 'b']);
	});
});

describe('roughGraphemes (browsers without Intl.Segmenter)', () => {
	it('agrees with Intl.Segmenter on emoji, flags and accents', () => {
		const samples = [
			...SINGLES,
			'🐐🐐',
			`${FLAG_US}${FLAG_US}`,
			`${FLAG_US}\u{1F1FA}`, // a flag, then a lone regional indicator
			`${TEACHER}${THUMBS_MEDIUM}x`,
			'Rocket 🚀',
			''
		];
		for (const sample of samples) expect(roughGraphemes(sample)).toEqual(graphemes(sample));
	});
});

describe('emojiProblem', () => {
	it('accepts exactly one emoji, spaces around it allowed', () => {
		for (const single of [...SINGLES, '🚀', ' 🦖 ']) expect(emojiProblem(single)).toBeUndefined();
	});

	it('asks for one when empty', () => {
		expect(emojiProblem('')).toBe('Please choose an emoji.');
		expect(emojiProblem('   ')).toBe('Please choose an emoji.');
	});

	it('refuses more than one, saying how many', () => {
		expect(emojiProblem('🐐🐐')).toBe('Please use just one emoji (there are 2 characters here).');
		expect(emojiProblem(`${TEACHER} ${HEART}`)).toMatch(/there are 3 characters/);
		expect(emojiProblem('Rocket')).toMatch(/just one emoji/);
	});
});

describe('EMOJI_PALETTE', () => {
	it('holds single, different emoji with names', () => {
		const emoji = EMOJI_PALETTE.map((item) => item.emoji);
		expect(new Set(emoji).size).toBe(emoji.length);
		for (const item of EMOJI_PALETTE) {
			expect(emojiProblem(item.emoji), item.name).toBeUndefined();
			expect(item.name.trim()).not.toBe('');
		}
	});
});
