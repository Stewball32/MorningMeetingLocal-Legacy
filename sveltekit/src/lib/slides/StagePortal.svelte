<!--
	Skeleton's Portal, but into the presenter's stage instead of <body>: a popover on a slide is then
	scaled with the slide and uses the stage's breakpoint sizes (see lib/slides/stage.ts). Outside
	the presenter it falls back to <body>, like Portal.
-->
<script lang="ts">
	import { Portal } from '@skeletonlabs/skeleton-svelte';
	import type { Snippet } from 'svelte';
	import { getStageContext } from './stage.ts';

	let { children }: { children: Snippet } = $props();

	const stage = getStageContext();
	// in the presenter, wait for the stage to be mounted instead of starting on <body> and moving
	let target = $derived(stage ? stage.element : document.body);
</script>

{#if target}
	<Portal {target}>
		{@render children()}
	</Portal>
{/if}
