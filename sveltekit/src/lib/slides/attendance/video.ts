// YouTube welcome videos on the attendance pages.

export interface VideoClip {
	id: string;
	start?: number; // seconds
	end?: number; // seconds
}

/** The embedded player's address (starts paused at `start`, stops at `end`). */
export const youtubeEmbedUrl = ({ id, start, end }: VideoClip) => {
	const params = new URLSearchParams({ rel: '0', enablejsapi: '1', autoplay: '0' });
	if (start) params.set('start', String(start));
	if (end) params.set('end', String(end));
	return `https://www.youtube.com/embed/${encodeURIComponent(id)}?${params}`;
};

/** The video's page on YouTube, at `start` (the watch page has no end time). */
export const youtubeWatchUrl = ({ id, start }: VideoClip) => {
	const params = new URLSearchParams({ v: id });
	if (start) params.set('t', `${start}s`);
	return `https://www.youtube.com/watch?${params}`;
};

/**
 * Clicking the video player moves the keyboard focus into its frame, and the slide's arrow-key
 * controls stop working. Call this when the window loses the focus: if it went to a video, take
 * it back (the video keeps playing; only YouTube's own keyboard shortcuts stop working).
 */
export const releaseVideoFocus = () => {
	setTimeout(() => {
		const active = document.activeElement;
		if (active instanceof HTMLIFrameElement) {
			active.blur();
			window.focus();
		}
	});
};
