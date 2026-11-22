import { describe, expect, it } from 'vitest';
import { formatTime, parseTime, parseYouTube, slideVideoUrl } from './youtube.ts';

const ID = 'dQw4w9WgXcQ';

describe('parseTime', () => {
	it.each([
		['90', 90],
		['0', 0],
		[' 90 ', 90],
		['90s', 90],
		['90S', 90],
		['90.7', 90],
		['2m', 120],
		['1m30s', 90],
		['1m5s', 65],
		['1h', 3600],
		['1h2m3s', 3723],
		['1h3s', 3603],
		['1:30', 90],
		['0:05', 5],
		['75:00', 4500],
		['1:02:03', 3723]
	])('reads %j as %i seconds', (text, seconds) => {
		expect(parseTime(text)).toBe(seconds);
	});

	it.each(['', '   ', 'abc', '-5', '1:75', '1:02:75', '1m30', 'm', 's', '1.5m', '1:2:3:4', '10 s'])(
		'rejects %j',
		(text) => {
			expect(parseTime(text)).toBeUndefined();
		}
	);

	it('treats null and undefined as empty', () => {
		expect(parseTime(null)).toBeUndefined();
		expect(parseTime(undefined)).toBeUndefined();
	});
});

describe('formatTime', () => {
	it('formats minutes and hours', () => {
		expect(formatTime(0)).toBe('0:00');
		expect(formatTime(5)).toBe('0:05');
		expect(formatTime(90)).toBe('1:30');
		expect(formatTime(3723)).toBe('1:02:03');
		expect(formatTime(-3)).toBe('0:00');
	});
});

describe('parseYouTube', () => {
	it('treats blank input as no video', () => {
		expect(parseYouTube('')).toEqual({ kind: 'empty' });
		expect(parseYouTube('   ')).toEqual({ kind: 'empty' });
		expect(parseYouTube(undefined)).toEqual({ kind: 'empty' });
	});

	it('accepts a bare 11-character video ID', () => {
		expect(parseYouTube(ID)).toEqual({ kind: 'video', id: ID });
		expect(parseYouTube(`  ${ID}\n`)).toEqual({ kind: 'video', id: ID });
		expect(parseYouTube('8nv1m-aTCZI')).toEqual({ kind: 'video', id: '8nv1m-aTCZI' });
		expect(parseYouTube('a_b-c_d-e_f')).toEqual({ kind: 'video', id: 'a_b-c_d-e_f' });
	});

	it.each([
		`https://www.youtube.com/watch?v=${ID}`,
		`http://youtube.com/watch?v=${ID}`,
		`www.youtube.com/watch?v=${ID}`,
		`youtube.com/watch?v=${ID}`,
		`https://m.youtube.com/watch?v=${ID}&feature=share`,
		`https://music.youtube.com/watch?v=${ID}`,
		`https://www.youtube.com/watch?feature=shared&v=${ID}&list=PL123&index=2`,
		`https://youtu.be/${ID}`,
		`youtu.be/${ID}?si=AbCdEf123`,
		`https://www.youtube.com/embed/${ID}`,
		`https://www.youtube-nocookie.com/embed/${ID}?rel=0`,
		`https://www.youtube.com/shorts/${ID}`,
		`https://youtube.com/shorts/${ID}?feature=share`,
		`https://www.youtube.com/live/${ID}`,
		`https://www.youtube.com/v/${ID}`,
		`HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`
	])('finds the video in %s', (url) => {
		expect(parseYouTube(url)).toEqual({ kind: 'video', id: ID });
	});

	it.each([
		[`https://www.youtube.com/watch?v=${ID}&t=90`, 90],
		[`https://www.youtube.com/watch?v=${ID}&t=90s`, 90],
		[`https://www.youtube.com/watch?v=${ID}&t=1m30s`, 90],
		[`https://www.youtube.com/watch?t=1h2m3s&v=${ID}`, 3723],
		[`https://youtu.be/${ID}?t=42`, 42],
		[`https://youtu.be/${ID}?si=xyz&t=7`, 7],
		[`https://www.youtube.com/embed/${ID}?start=15`, 15],
		[`https://www.youtube.com/shorts/${ID}?t=3`, 3],
		[`https://www.youtube.com/watch?v=${ID}#t=1m`, 60],
		[`https://www.youtube.com/watch?v=${ID}&t=0`, 0]
	])('reads the start time from %s', (url, start) => {
		expect(parseYouTube(url)).toEqual({ kind: 'video', id: ID, start });
	});

	it('reads start and end from an embed link', () => {
		expect(parseYouTube(`https://www.youtube.com/embed/${ID}?start=10&end=25`)).toEqual({
			kind: 'video',
			id: ID,
			start: 10,
			end: 25
		});
	});

	it("understands the slides' own links (with the stray ?rel=0 after the ID)", () => {
		const url = slideVideoUrl({ video_id: ID, video_start: 14, video_end: 30 });
		expect(parseYouTube(url)).toEqual({ kind: 'video', id: ID, start: 14, end: 30 });
		const embedded = slideVideoUrl({ video_id: ID, video_start: 14, video_end: 30 }, true);
		expect(parseYouTube(embedded)).toEqual({ kind: 'video', id: ID, start: 14, end: 30 });
	});

	it('ignores a start time it cannot read', () => {
		expect(parseYouTube(`https://youtu.be/${ID}?t=soon`)).toEqual({ kind: 'video', id: ID });
	});

	it.each([
		'hello',
		'dQw4w9WgXc', // 10 characters
		'dQw4w9WgXcQQ', // 12 characters
		'dQw4w9WgX!Q',
		'https://www.youtube.com/',
		'https://www.youtube.com/watch',
		'https://www.youtube.com/watch?v=short',
		`https://www.youtube.com/watch?v=${ID}Q`,
		'https://www.youtube.com/@SomeChannel',
		'https://www.youtube.com/playlist?list=PL1234567890',
		`https://vimeo.com/${ID}`,
		`https://example.com/watch?v=${ID}`,
		`https://notyoutube.com/watch?v=${ID}`,
		`ftp://youtube.com/watch?v=${ID}`,
		'javascript:alert(1)',
		'https://'
	])('rejects %s', (text) => {
		expect(parseYouTube(text)).toEqual({ kind: 'invalid' });
	});
});

describe('slideVideoUrl', () => {
	it('builds the same URL as the attendance slides', () => {
		expect(slideVideoUrl({ video_id: ID, video_start: 14, video_end: 30 })).toBe(
			`https://www.youtube.com/watch?v=${ID}?rel=0&enablejsapi=1&autoplay=0&start=14&end=30`
		);
		expect(slideVideoUrl({ video_id: ID, video_start: 14, video_end: 30 }, true)).toBe(
			`https://www.youtube.com/embed/${ID}?rel=0&enablejsapi=1&autoplay=0&start=14&end=30`
		);
	});

	it('leaves out a start or end of 0', () => {
		expect(slideVideoUrl({ video_id: ID, video_start: 0, video_end: 24 })).toBe(
			`https://www.youtube.com/watch?v=${ID}?rel=0&enablejsapi=1&autoplay=0&end=24`
		);
		expect(slideVideoUrl({ video_id: ID })).toBe(
			`https://www.youtube.com/watch?v=${ID}?rel=0&enablejsapi=1&autoplay=0`
		);
	});
});
