import { describe, it, expect } from 'vitest';
import { MAX_STAGE_SCALE, STAGE_SIZES, stageLayout } from './stage.ts';

const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const SCREENS = [
	[1920, 1080],
	[1366, 768],
	[1280, 720],
	[2560, 1440],
	[3840, 2160]
];

// A window of W x H device pixels at browser zoom z: the page sees about (W/z) x (H/z) CSS pixels
// (innerWidth/innerHeight are whole numbers) and a devicePixelRatio of z. `round` picks how the
// browser rounds the size.
const zoomed = (W: number, H: number, z: number, round = Math.round, maxScale = Infinity) =>
	stageLayout(round(W / z), round(H / z), z, maxScale);

// the stage's width on screen, in device pixels
const onScreen = (W: number, H: number, z: number, round = Math.round, maxScale = Infinity) => {
	const s = zoomed(W, H, z, round, maxScale);
	return s.size.width * s.scale * z;
};

describe('stageLayout', () => {
	it('draws the classroom TV and a 1366x768 laptop at 100% exactly as before the stage', () => {
		expect(stageLayout(1920, 1080, 1, Infinity)).toMatchObject({
			size: { breakpoint: '3xl', width: 1920, height: 1080 },
			scale: 1,
			left: 0,
			top: 0
		});
		expect(stageLayout(1366, 768, 1, Infinity)).toMatchObject({
			size: { breakpoint: 'xl', width: 1366, height: 768 },
			scale: 1,
			left: 0,
			top: 0
		});
	});

	it('keeps the layout and the size on screen at every browser zoom', () => {
		for (const [W, H] of SCREENS) {
			const at100 = zoomed(W, H, 1);
			for (const z of ZOOMS) {
				for (const round of [Math.round, Math.floor, Math.ceil]) {
					const s = zoomed(W, H, z, round);
					expect(s.size.breakpoint, `${W}x${H} at ${z * 100}%`).toBe(at100.size.breakpoint);
					// the same to within one CSS pixel of rounding (at most 16/9 * 2 device pixels)
					expect(Math.abs(onScreen(W, H, z, round) - onScreen(W, H, 1))).toBeLessThan(3.6);
				}
			}
		}
	});

	it('never lets the stage overflow the window', () => {
		for (const [W, H] of [
			...SCREENS,
			[1920, 945],
			[1366, 633],
			[1536, 729],
			[800, 1200],
			[300, 900]
		]) {
			for (const z of ZOOMS) {
				const width = Math.round(W / z);
				const height = Math.round(H / z);
				const s = stageLayout(width, height, z, Infinity);
				expect(s.left).toBeGreaterThanOrEqual(0);
				expect(s.top).toBeGreaterThanOrEqual(0);
				expect(s.left + s.size.width * s.scale).toBeLessThanOrEqual(width + 0.5);
				expect(s.top + s.size.height * s.scale).toBeLessThanOrEqual(height + 0.5);
			}
		}
	});

	it('scales the slide down to fit a short window and centres it', () => {
		// a maximised browser on a 1920x1080 screen: the tabs and address bar take about 135px
		const s = stageLayout(1920, 945, 1, Infinity);
		expect(s.size.breakpoint).toBe('3xl');
		expect(s.scale).toBeCloseTo(945 / 1080);
		expect(s.top).toBe(0);
		expect(s.left).toBe(Math.round((1920 - 1920 * s.scale) / 2));
	});

	it('fills bigger screens (the slide grows past 1920 pixels)', () => {
		expect(stageLayout(2560, 1440, 1, Infinity)).toMatchObject({
			size: { breakpoint: '3xl' },
			scale: 4 / 3
		});
		expect(stageLayout(3840, 2160, 1, Infinity)).toMatchObject({
			size: { breakpoint: '3xl' },
			scale: 2
		});
	});

	it('uses the real pixels, so a 1080p laptop at 125% display scaling shows the TV layout', () => {
		const s = stageLayout(1536, 864, 1.25, Infinity);
		expect(s.size.breakpoint).toBe('3xl');
		expect(s.scale).toBeCloseTo(0.8);
	});

	it('picks each breakpoint from its width in device pixels', () => {
		for (const [i, size] of STAGE_SIZES.entries()) {
			const next = STAGE_SIZES[i + 1];
			const from = Math.max(size.minDevicePixels, 1);
			expect(stageLayout(from, 2000, 1, Infinity).size.breakpoint).toBe(size.breakpoint);
			if (next) {
				// one CSS pixel below the next breakpoint still counts as the next one (rounding)
				expect(stageLayout(next.minDevicePixels - 2, 2000, 1, Infinity).size.breakpoint).toBe(
					size.breakpoint
				);
				expect(stageLayout(next.minDevicePixels - 1, 2000, 1, Infinity).size.breakpoint).toBe(
					next.breakpoint
				);
			}
		}
	});

	it('has a 16:9 stage for every breakpoint, wider than the breakpoint itself', () => {
		for (const [i, size] of STAGE_SIZES.entries()) {
			expect(size.width / size.height).toBeCloseTo(16 / 9, 2);
			expect(size.width).toBeGreaterThanOrEqual(size.minDevicePixels);
			const next = STAGE_SIZES[i + 1];
			if (next) {
				expect(size.width).toBeLessThan(next.minDevicePixels);
				expect(next.width).toBeGreaterThan(size.width);
			}
		}
	});

	it('is set to fill the window (Infinity) or, for option A2, to never upscale (1)', () => {
		// the other tests pass the cap explicitly, so they stay true whichever one is chosen
		expect([1, Infinity]).toContain(MAX_STAGE_SCALE);
	});

	it('with the scale capped at 1, never draws the stage bigger than its layout', () => {
		// what MAX_STAGE_SCALE = 1 would do: the slide stops growing at its layout size...
		expect(stageLayout(2560, 1440, 1, 1)).toMatchObject({ scale: 1, left: 320, top: 180 });
		// ...zooming out shrinks it...
		expect(onScreen(1920, 1080, 0.5, Math.round, 1)).toBeCloseTo(960);
		// ...zooming in grows it, until it fills the window
		expect(onScreen(2560, 1440, 1.25, Math.round, 1)).toBeCloseTo(2400);
		expect(onScreen(2560, 1440, 2, Math.round, 1)).toBeCloseTo(2560);
		// it never overflows the window either
		expect(stageLayout(1920, 945, 1, 1).scale).toBeCloseTo(945 / 1080);
	});
});
