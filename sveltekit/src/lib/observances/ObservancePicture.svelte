<script lang="ts">
	import Picture from '#lib/editor/Picture.svelte';
	import { DEFAULT_PICTURE } from './observances.ts';

	interface Props {
		/** The picture's URL; '' shows the calendar's default picture, like the slide. */
		src: string;
		alt?: string;
		/** Shown when there is no picture or it fails to load (a birthday: the cake). */
		fallback?: string;
		class?: string;
	}

	let { src, alt = '', fallback = DEFAULT_PICTURE, class: className = '' }: Props = $props();
</script>

<!-- A picture that fails to load (file missing, PocketBase down) shows the default, like the slide. -->
<Picture {src} {alt} {fallback} round={false} class={className} />
