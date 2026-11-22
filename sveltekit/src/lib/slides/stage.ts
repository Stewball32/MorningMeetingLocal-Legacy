import { getContext, setContext } from 'svelte';

/**
 * The presenter's "stage": a fixed-size box the slides are laid out on, scaled to fit the window
 * (see routes/present/+layout.svelte).
 *
 * Each Tailwind breakpoint has its own stage size. Inside the stage the sm..3xl classes follow the
 * stage's width instead of the window's (see the custom variants in app.css), so each breakpoint
 * keeps the layout it always had and only its scale changes.
 */
export interface StageSize {
	/** the breakpoint whose layout is drawn, as in the sm..3xl classes ('xs' is below sm) */
	breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
	/** narrowest window, in device pixels, that gets this layout (the breakpoint's width) */
	minDevicePixels: number;
	/** the stage size in CSS pixels (16:9), before scaling */
	width: number;
	height: number;
}

// The paper fills about 93.5% of the stage's width at every size, so the slide keeps its size on
// screen when the window crosses a breakpoint. The xl and 3xl stages are exactly a 1366x768 laptop
// and the classroom's 1920x1080 TV, so at 100% zoom those two look exactly as they did before the
// stage. The other stages are those sizes' proportions at the other breakpoints.
export const STAGE_SIZES: readonly StageSize[] = [
	{ breakpoint: 'xs', minDevicePixels: 0, width: 342, height: 192 },
	{ breakpoint: 'sm', minDevicePixels: 640, width: 684, height: 385 },
	{ breakpoint: 'md', minDevicePixels: 768, width: 821, height: 462 },
	{ breakpoint: 'lg', minDevicePixels: 1024, width: 1091, height: 614 },
	{ breakpoint: 'xl', minDevicePixels: 1280, width: 1366, height: 768 },
	{ breakpoint: '2xl', minDevicePixels: 1536, width: 1626, height: 915 },
	{ breakpoint: '3xl', minDevicePixels: 1792, width: 1920, height: 1080 }
];

/**
 * The largest scale the stage is drawn at.
 *
 * Infinity: the slide always fills the window, whatever the screen size and the browser zoom
 * (Ctrl and +/-); zooming doesn't change the slide.
 *
 * 1: the slide is never drawn bigger than its own layout. Ctrl and - then shrinks it, and Ctrl
 * and + grows it back until it fills the window. But on screens wider than 1920 pixels (2560x1440,
 * 4K) the slide stays 1920 pixels wide with blue around it, as it was before the stage.
 */
export const MAX_STAGE_SCALE = Infinity;

export interface StageLayout {
	size: StageSize;
	/** the CSS transform scale that fits the stage in the window */
	scale: number;
	/** where the stage's top-left corner goes in the window, in CSS pixels (centred) */
	left: number;
	top: number;
}

/**
 * Picks the slide layout from the window's width in device pixels and fits that stage in the
 * window.
 *
 * Browser zoom changes the window's size in CSS pixels and the device pixel ratio in opposite
 * directions, so their product (the screen's real pixels), the layout and the slide's size on
 * screen stay the same at every zoom level. Resizing the window scales the slide with it.
 *
 * @param width - the window's width in CSS pixels (innerWidth)
 * @param height - the window's height in CSS pixels (innerHeight)
 * @param dpr - devicePixelRatio: the operating system's display scaling times the browser zoom
 * @param maxScale - see MAX_STAGE_SCALE
 */
export function stageLayout(
	width: number,
	height: number,
	dpr: number,
	maxScale: number = MAX_STAGE_SCALE
): StageLayout {
	// innerWidth is a whole number of CSS pixels, so at 110% zoom a 1280-pixel window can report
	// 1163 (1279.3 device pixels): allow for up to one CSS pixel lost to rounding.
	const devicePixels = (width + 1) * dpr;
	const size = STAGE_SIZES.findLast((s) => devicePixels >= s.minDevicePixels) ?? STAGE_SIZES[0];
	const scale = Math.min(width / size.width, height / size.height, maxScale);
	return {
		size,
		scale,
		left: Math.round((width - size.width * scale) / 2),
		top: Math.round((height - size.height * scale) / 2)
	};
}

const STAGE_KEY = Symbol('stage');

export interface StageContext {
	/** the stage element, once it is mounted */
	readonly element: HTMLElement | undefined;
}

/** Called by the presenter's layout, so popovers can be drawn on the stage (see StagePortal). */
export const setStageContext = (context: StageContext) => setContext(STAGE_KEY, context);

/** The presenter's stage, or undefined outside the presenter. */
export const getStageContext = (): StageContext | undefined => getContext(STAGE_KEY);
