<script lang="ts">
	import { DEFAULT_AVATAR } from './people.ts';

	interface Props {
		src: string;
		alt?: string;
		class?: string;
	}

	let { src, alt = '', class: className = '' }: Props = $props();

	// A picture that fails to load (file missing, PocketBase down) shows the default avatar.
	let failedSrc = $state('');
	const shown = $derived(src && src !== failedSrc ? src : DEFAULT_AVATAR);
</script>

<img
	src={shown}
	{alt}
	draggable={false}
	onerror={() => {
		if (shown !== DEFAULT_AVATAR) failedSrc = shown;
	}}
	class="bg-surface-100-900 border-surface-200-800 aspect-square shrink-0 rounded-full border-2 object-cover {className}"
/>
