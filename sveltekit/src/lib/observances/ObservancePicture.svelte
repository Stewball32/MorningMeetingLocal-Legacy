<script lang="ts">
	import Picture from '#lib/editor/Picture.svelte';
	import { DEFAULT_PICTURE } from './observances.ts';

	interface Props {
		/** The picture's URL; '' shows the calendar's default picture, like the slide. */
		src: string;
		alt?: string;
		class?: string;
	}

	let { src, alt = '', class: className = '' }: Props = $props();
</script>

<!-- A picture that fails to load (file missing, PocketBase down) shows the default, like the slide. -->
<Picture {src} {alt} fallback={DEFAULT_PICTURE} round={false} class={className} />
