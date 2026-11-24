<!--
	@component
	The small picture next to a name in the Add Guest and Delete Guest lists, about as tall as the
	text. Decorative (the name is right next to it). One that doesn't load (file missing,
	PocketBase down) shows the default avatar instead, once: if that fails too, it stays as it is.
-->
<script lang="ts">
	import { DEFAULT_AVATAR } from '#lib/slides/people.ts';

	interface Props {
		/** The picture (e.g. a GuestNameOption's); '' shows the default avatar. */
		src: string;
	}

	let { src }: Props = $props();

	let failedSrc = $state('');
	const shown = $derived(src && src !== failedSrc ? src : DEFAULT_AVATAR);
</script>

<img
	src={shown}
	alt=""
	loading="lazy"
	draggable={false}
	onerror={() => {
		if (shown !== DEFAULT_AVATAR) failedSrc = shown;
	}}
	class="size-[1.5em] shrink-0 rounded-md object-cover"
	data-name-picture
/>
