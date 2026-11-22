<script lang="ts">
	import Picture from '#lib/editor/Picture.svelte';
	import { DEFAULT_AVATAR } from './people.ts';

	interface Props {
		src: string;
		alt?: string;
		class?: string;
	}

	let { src, alt = '', class: className = '' }: Props = $props();
</script>

<!-- A picture that fails to load (file missing, PocketBase down) shows the default avatar. -->
<Picture {src} {alt} fallback={DEFAULT_AVATAR} class={className} />
