<!--
	@component
	An icon's picture in the list: a rounded square showing the whole picture, or a plain "no
	picture" tile when the icon has none or its picture fails to load (file missing, PocketBase
	down). Decorative: the row says the name, and "no picture" in words. Size it with `class`.
-->
<script lang="ts">
	import ImageOff from '@lucide/svelte/icons/image-off';

	interface Props {
		src: string;
		class?: string;
	}

	let { src, class: className = '' }: Props = $props();

	let failedSrc = $state('');
	const missing = $derived(!src || src === failedSrc);
</script>

{#if missing}
	<span
		class="bg-surface-100-900 border-surface-300-700 rounded-base flex aspect-square shrink-0 items-center justify-center border-2 border-dashed {className}"
		title={src ? "The picture couldn't be loaded" : 'No picture'}
		aria-hidden="true"
	>
		<ImageOff class="size-1/2 opacity-50" />
	</span>
{:else}
	<img
		{src}
		alt=""
		draggable={false}
		onerror={() => (failedSrc = src)}
		class="bg-surface-100-900 border-surface-200-800 rounded-base aspect-square shrink-0 border-2 object-contain {className}"
	/>
{/if}
