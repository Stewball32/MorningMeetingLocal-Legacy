import { describe, expect, it } from 'vitest';
import { youtubeEmbedUrl, youtubeWatchUrl } from './video.ts';

describe('YouTube addresses', () => {
	it('embeds with the same parameters as before', () => {
		expect(youtubeEmbedUrl({ id: 'batjBLqr8ck', start: 201, end: 223 })).toBe(
			'https://www.youtube.com/embed/batjBLqr8ck?rel=0&enablejsapi=1&autoplay=0&start=201&end=223'
		);
		expect(youtubeEmbedUrl({ id: 'abc' })).toBe(
			'https://www.youtube.com/embed/abc?rel=0&enablejsapi=1&autoplay=0'
		);
	});

	it('links the watch page with one "?" and t= for the start', () => {
		expect(youtubeWatchUrl({ id: 'batjBLqr8ck', start: 201, end: 223 })).toBe(
			'https://www.youtube.com/watch?v=batjBLqr8ck&t=201s'
		);
		expect(youtubeWatchUrl({ id: 'abc' })).toBe('https://www.youtube.com/watch?v=abc');
	});
});
