// An icon's emoji: exactly one character as people see it (a "grapheme": 👩‍🏫, 🇺🇸 and 👍🏽 are
// one each, although each is made of several code points), plus a palette of common ones. The
// emoji is shown next to the icon's name in the Add Guest lists.

const segmenter =
	typeof Intl !== 'undefined' && 'Segmenter' in Intl
		? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
		: null;

const ZWJ = 0x200d;
const between = (code: number, from: number, to: number) => code >= from && code <= to;
const MARK = /^\p{M}$/u;

/**
 * Whether a character joins onto the one before it: combining marks (accents, emoji variation
 * selectors, the keycap), the zero-width joiner, skin tones and tags (as in subdivision flags).
 */
function joinsBefore(char: string): boolean {
	const code = char.codePointAt(0) ?? 0;
	return (
		MARK.test(char) ||
		code === ZWJ ||
		between(code, 0x1f3fb, 0x1f3ff) ||
		between(code, 0xe0020, 0xe007f)
	);
}

/** A regional indicator: two of them make a flag. */
const isRegional = (text: string) =>
	text.length === 2 && between(text.codePointAt(0) ?? 0, 0x1f1e6, 0x1f1ff);

/**
 * A close approximation of Intl.Segmenter's graphemes for browsers without it (Firefox before
 * 125): enough for emoji sequences, flags and accented letters.
 */
export function roughGraphemes(text: string): string[] {
	const result: string[] = [];
	let joinNext = false;
	for (const char of text) {
		const last = result.at(-1);
		const pairsFlag = last !== undefined && isRegional(last) && isRegional(char);
		if (last !== undefined && (joinNext || joinsBefore(char) || pairsFlag)) {
			result[result.length - 1] = last + char;
			joinNext = char.codePointAt(0) === ZWJ;
		} else {
			result.push(char);
			joinNext = false;
		}
	}
	return result;
}

/** The characters of `text` as people see them. */
export function graphemes(text: string): string[] {
	if (!segmenter) return roughGraphemes(text);
	return Array.from(segmenter.segment(text), (part) => part.segment);
}

/** Why `text` can't be an icon's emoji, or undefined when it can (spaces around it don't count). */
export function emojiProblem(text: string): string | undefined {
	const trimmed = text.trim();
	if (!trimmed) return 'Please choose an emoji.';
	const count = graphemes(trimmed).length;
	if (count > 1) return `Please use just one emoji (there are ${count} characters here).`;
	return undefined;
}

/** A palette of common emoji to click, with names for hover and screen readers. */
export const EMOJI_PALETTE: readonly { emoji: string; name: string }[] = [
	{ emoji: '👩‍🏫', name: 'teacher' },
	{ emoji: '🧑‍🚒', name: 'firefighter' },
	{ emoji: '👮', name: 'police officer' },
	{ emoji: '🧑‍⚕️', name: 'doctor or nurse' },
	{ emoji: '🧑‍🍳', name: 'cook' },
	{ emoji: '👵', name: 'grandma' },
	{ emoji: '👴', name: 'grandpa' },
	{ emoji: '🦸', name: 'superhero' },
	{ emoji: '🐶', name: 'dog' },
	{ emoji: '🐱', name: 'cat' },
	{ emoji: '🦁', name: 'lion' },
	{ emoji: '🐻', name: 'bear' },
	{ emoji: '🐼', name: 'panda' },
	{ emoji: '🦄', name: 'unicorn' },
	{ emoji: '🦖', name: 'dinosaur' },
	{ emoji: '🐸', name: 'frog' },
	{ emoji: '🚀', name: 'rocket' },
	{ emoji: '🤖', name: 'robot' },
	{ emoji: '⭐', name: 'star' },
	{ emoji: '🌈', name: 'rainbow' },
	{ emoji: '☀️', name: 'sun' },
	{ emoji: '❄️', name: 'snowflake' },
	{ emoji: '🍎', name: 'apple' },
	{ emoji: '📚', name: 'books' },
	{ emoji: '🎈', name: 'balloon' },
	{ emoji: '🎉', name: 'party popper' },
	{ emoji: '🎂', name: 'birthday cake' },
	{ emoji: '🎃', name: 'jack-o-lantern' },
	{ emoji: '🦃', name: 'turkey' },
	{ emoji: '🎄', name: 'Christmas tree' },
	{ emoji: '❤️', name: 'heart' },
	{ emoji: '🍀', name: 'four-leaf clover' }
];
