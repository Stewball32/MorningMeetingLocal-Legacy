// Welcome videos: turning whatever the teacher pastes (a YouTube link or a bare video ID) into
// the video_id / video_start / video_end fields, and building the URL the slides play.

/** A YouTube video ID is 11 characters of A-Z, a-z, 0-9, _ and -. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LEADING_VIDEO_ID = /^([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/;

/** The longest start or end time the form takes. (YouTube videos are at most 12 hours.) */
export const MAX_SECONDS = 24 * 60 * 60;

/** A time in a pasted link that couldn't be used, e.g. `t=-5`. */
export interface TimeIssue {
	/** The link parameter: t, start or end. */
	param: string;
	value: string;
	problem: 'unreadable' | 'too-long';
}

export type VideoParse =
	| { kind: 'empty' }
	| { kind: 'invalid' }
	| { kind: 'video'; id: string; start?: number; end?: number; issues?: TimeIssue[] };

/**
 * Reads a time the way YouTube links and people write it, in whole seconds:
 * `90`, `90s`, `1m30s`, `1m30`, `1h2m3s`, `2m`, `1:30`, `1:02:03`.
 * Returns undefined for empty or unreadable text. (The result can be more than MAX_SECONDS.)
 */
export function parseTime(text: string | null | undefined): number | undefined {
	const value = (text ?? '').trim().toLowerCase();
	if (!value) return undefined;

	const seconds = /^(\d+)(?:\.\d+)?s?$/.exec(value);
	if (seconds) return Number(seconds[1]);

	// 1h2m3s, 2m, 1h3s; and 1m30, the way people (not YouTube) leave off the s.
	const units =
		/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value) ?? /^(?:(\d+)h)?(\d+)m(\d+)$/.exec(value);
	if (units && (units[1] || units[2] || units[3])) {
		const [, h = '0', m = '0', s = '0'] = units;
		return Number(h) * 3600 + Number(m) * 60 + Number(s);
	}

	const clock = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(value);
	if (clock) {
		const [, a, b, c] = clock;
		if (c === undefined) {
			if (Number(b) > 59) return undefined;
			return Number(a) * 60 + Number(b);
		}
		if (Number(b) > 59 || Number(c) > 59) return undefined;
		return Number(a) * 3600 + Number(b) * 60 + Number(c);
	}

	return undefined;
}

/** 90 -> "1:30", 3723 -> "1:02:03". */
export function formatTime(totalSeconds: number): string {
	const s = Math.max(0, Math.floor(totalSeconds));
	const hours = Math.floor(s / 3600);
	const minutes = Math.floor((s % 3600) / 60);
	const seconds = String(s % 60).padStart(2, '0');
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
		: `${minutes}:${seconds}`;
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'youtube-nocookie.com']);
const ID_PATH_PREFIXES = new Set(['embed', 'shorts', 'live', 'v', 'e']);

/** YouTube's Share > Embed code: `<iframe ... src="https://www.youtube.com/embed/ID?start=30">`. */
const IFRAME_SRC = /^<iframe\b[^>]*?\ssrc\s*=\s*(["'])(.*?)\1/is;

/**
 * Understands a bare 11-character video ID and YouTube links: youtube.com/watch?v=ID,
 * youtu.be/ID, youtube.com/embed/ID, /shorts/ID, /live/ID (with or without https:// and www. or
 * m.), including the link the slides themselves open, and an embed <iframe> snippet. A start
 * time comes from t= or start= (also after #, or after a stray & or ? right behind the ID as in
 * youtu.be/ID&t=30), an end time from end=. Times that are there but can't be used are listed
 * in `issues`.
 */
export function parseYouTube(input: string | null | undefined): VideoParse {
	let text = (input ?? '').trim();
	if (!text) return { kind: 'empty' };
	if (VIDEO_ID.test(text)) return { kind: 'video', id: text };
	const iframe = IFRAME_SRC.exec(text);
	if (iframe) text = iframe[2].replace(/&amp;/g, '&').trim();

	let url: URL;
	try {
		url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
	} catch {
		return { kind: 'invalid' };
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'invalid' };

	const host = url.hostname.toLowerCase().replace(/^(?:www|m|music)\./, '');
	const segments = url.pathname.split('/').filter(Boolean);
	let candidate: string | null | undefined;
	if (host === 'youtu.be') {
		candidate = segments[0];
	} else if (YOUTUBE_HOSTS.has(host)) {
		if (segments.length === 0 || segments[0] === 'watch') candidate = url.searchParams.get('v');
		else if (ID_PATH_PREFIXES.has(segments[0])) candidate = segments[1];
	}
	// The slides' own links read watch?v=ID?rel=0&...: the ID is followed by a stray "?...".
	const id = candidate ? LEADING_VIDEO_ID.exec(candidate)?.[1] : undefined;
	if (!candidate || !id) return { kind: 'invalid' };

	const sources = [
		url.searchParams,
		new URLSearchParams(candidate.slice(id.length).replace(/^[?&]/, '')),
		new URLSearchParams(url.hash.replace(/^#/, ''))
	];
	const issues: TimeIssue[] = [];
	/** The first of these parameters the link has, in seconds; undefined if it can't be used. */
	const readTime = (...params: string[]): number | undefined => {
		for (const source of sources) {
			for (const param of params) {
				const value = source.get(param)?.trim();
				if (!value) continue;
				const seconds = parseTime(value);
				if (seconds !== undefined && seconds <= MAX_SECONDS) return seconds;
				issues.push({ param, value, problem: seconds === undefined ? 'unreadable' : 'too-long' });
				return undefined;
			}
		}
		return undefined;
	};
	const start = readTime('t', 'start');
	const end = readTime('end');

	const result: VideoParse = { kind: 'video', id };
	if (start !== undefined) result.start = start;
	if (end !== undefined) result.end = end;
	if (issues.length > 0) result.issues = issues;
	return result;
}

/** Says which link times couldn't be used, e.g. "Couldn't read t=-5 in the link." */
export function describeTimeIssues(issues: readonly TimeIssue[]): string {
	return issues
		.map(({ param, value, problem }) => {
			const shown = `${param}=${value.length > 20 ? `${value.slice(0, 20)}…` : value}`;
			return problem === 'too-long'
				? `The link's ${shown} is more than 24 hours.`
				: `Couldn't read ${shown} in the link.`;
		})
		.join(' ');
}

export interface VideoFields {
	video_id?: string;
	video_start?: number;
	video_end?: number;
}

/**
 * The URL the attendance slides use for a person's welcome video: the same string as
 * youtubeUrl() in lib/slides/attendance/WhoIsHere.svelte (keep the two in step). The slide plays
 * the embedded one; its YouTube button opens the other one in a new tab.
 */
export function slideVideoUrl(video: VideoFields, embedded = false): string {
	const start = video.video_start ? `&start=${video.video_start}` : '';
	const end = video.video_end ? `&end=${video.video_end}` : '';
	const baseUrl = embedded ? 'https://www.youtube.com/embed/' : 'https://www.youtube.com/watch?v=';
	return `${baseUrl}${video.video_id}?rel=0&enablejsapi=1&autoplay=0${start}${end}`;
}
