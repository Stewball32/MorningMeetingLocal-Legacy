<script lang="ts">
	import Maximize from '@lucide/svelte/icons/maximize';
	import Minimize from '@lucide/svelte/icons/minimize';
	import { slideStyle } from '#lib';
	import { setStageContext, stageLayout } from '#lib/slides/stage.ts';
	import { onDestroy, onMount } from 'svelte';

	let { children } = $props();

	// The slides are laid out on a stage of a fixed size, picked from the screen's real pixels, and
	// the stage is scaled to fit the window (see lib/slides/stage.ts). Browser zoom and the window
	// size then only change the scale: they never swap the slide to another layout or cut it off.
	// Zooming fires a resize, so the bindings below follow it live.
	let innerWidth = $state(window.innerWidth);
	let innerHeight = $state(window.innerHeight);
	let devicePixelRatio = $state(window.devicePixelRatio);
	let stage = $derived(stageLayout(innerWidth, innerHeight, devicePixelRatio));

	// popovers on the slides are drawn on the stage, so they are scaled with it (StagePortal)
	let stageElement: HTMLElement | undefined = $state();
	setStageContext({
		get element() {
			return stageElement;
		}
	});

	let isFullscreen = $state(!!document.fullscreenElement);

	const toggleFullscreen = () => {
		if (isFullscreen) {
			document.exitFullscreen();
		} else {
			document.documentElement.requestFullscreen();
		}
	};

	// update our flag whenever the browser fires fullscreenchange
	function updateState() {
		isFullscreen = !!document.fullscreenElement;
	}

	onMount(() => {
		// sync initial value (in case you start in FS already)
		updateState();
		// listen for changes
		document.addEventListener('fullscreenchange', updateState);
	});

	onDestroy(() => {
		document.removeEventListener('fullscreenchange', updateState);
	});

	const onKeydown = (event: KeyboardEvent) => {
		if (event.key === 'F11') {
			event.preventDefault();
			toggleFullscreen();
		}
	};
</script>

<svelte:window onkeydown={onKeydown} bind:innerWidth bind:innerHeight bind:devicePixelRatio />

<!-- the window's own controls: outside the stage, so they keep the browser's zoom -->
<div class="absolute top-1 right-1 z-10 grid grid-cols-1 gap-[10%]">
	<button
		onclick={toggleFullscreen}
		class="btn transparent- preset-filled-surface-400-600 m-0 border-2 p-[1%]"
	>
		{#if isFullscreen}
			<Minimize class="size-6" />
		{:else}
			<Maximize class="size-6" />
		{/if}
	</button>
</div>
<!-- the window: the stage is scaled to fit in it and centred -->
<div class="absolute inset-0 overflow-hidden">
	<!-- the stage: what the slides see as the screen (the sm..3xl classes follow its width) -->
	<div
		bind:this={stageElement}
		data-stage={stage.size.breakpoint}
		class="@container/stage absolute flex origin-top-left flex-col items-center"
		style:left="{stage.left}px"
		style:top="{stage.top}px"
		style:width="{stage.size.width}px"
		style:height="{stage.size.height}px"
		style:transform="scale({stage.scale})"
	>
		<!-- <h1> Current thing</h1> -->
		<div class="relative min-h-full place-content-center select-none">
			<img
				src="/paper.svg"
				draggable={false}
				class="
					3xl:w-[1920px]
					absolute
					aspect-[16/9]
					w-[320px]
					max-w-full
					overflow-hidden
					sm:w-[640px]
					md:w-[768px]
					lg:w-[1024px]
					xl:w-[1280px]
					2xl:w-[1536px]
				"
				alt=""
			/>

			<div class={slideStyle + ' select-none'}>
				{@render children()}
			</div>
		</div>
	</div>
</div>
