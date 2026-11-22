// Welcome videos: turning whatever the teacher pastes (a YouTube link or a bare video ID) into
// the video_id / video_start / video_end fields, and building the URL the slides play.

/** A YouTube video ID is 11 characters of A-Z, a-z, 0-9, _ and -. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LEADING_VIDEO_ID = /^([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/;

export type VideoParse =
	| { kind: 'empty' }
	| { kind: 'invalid' }
	| { kind: 'video'; id: string; start?: number; end?: number };

/**
 * Reads a time the way YouTube links and people write it, in whole seconds:
 * `90`, `90s`, `1m30s`, `1h2m3s`, `2m`, `1:30`, `1:02:03`.
 * Returns undefined for empty or unreadable text.
 */
export function parseTime(text: string | null | undefined): number | undefined {
	const value = (text ?? '').trim().toLowerCase();
	if (!value) return undefined;

	const seconds = /^(\d+)(?:\.\d+)?s?$/.exec(value);
	if (seconds) return Number(seconds[1]);

	const units = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
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

/**
 * Understands a bare 11-character video ID and YouTube links: youtube.com/watch?v=ID,
 * youtu.be/ID, youtube.com/embed/ID, /shorts/ID, /live/ID (with or without https:// and www. or
 * m.), including the link the slides themselves open. A start time comes from t= or start=
 * (also after #), an end time from end=.
 */
export function parseYouTube(input: string | null | undefined): VideoParse {
	const text = (input ?? '').trim();
	if (!text) return { kind: 'empty' };
	if (VIDEO_ID.test(text)) return { kind: 'video', id: text };

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
	if (!id) return { kind: 'invalid' };

	const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
	const start = parseTime(
		url.searchParams.get('t') ?? url.searchParams.get('start') ?? hash.get('t') ?? hash.get('start')
	);
	const end = parseTime(url.searchParams.get('end') ?? hash.get('end'));

	const result: VideoParse = { kind: 'video', id };
	if (start !== undefined) result.start = start;
	if (end !== undefined) result.end = end;
	return result;
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
