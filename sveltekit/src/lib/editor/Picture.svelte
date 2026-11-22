<!--
	@component
	A square picture (round by default) that shows `fallback` when it has no `src` or the picture
	fails to load (file missing, PocketBase down). Size it with `class`, e.g. "size-16".
	People use /defaults/avatar.png as the fallback (PersonAvatar), observances
	/defaults/calendar.png.
-->
<script lang="ts">
	interface Props {
		src: string;
		/** Shown instead; should be a file that always loads (from /static). */
		fallback: string;
		alt?: string;
		/** false: rounded corners instead of a circle. */
		round?: boolean;
		class?: string;
	}

	let { src, fallback, alt = '', round = true, class: className = '' }: Props = $props();

	let failedSrc = $state('');
	const shown = $derived(src && src !== failedSrc ? src : fallback);
</script>

<img
	src={shown}
	{alt}
	draggable={false}
	onerror={() => {
		if (shown !== fallback) failedSrc = shown;
	}}
	class="bg-surface-100-900 border-surface-200-800 aspect-square shrink-0 {round
		? 'rounded-full'
		: 'rounded-base'} border-2 object-cover {className}"
/>
