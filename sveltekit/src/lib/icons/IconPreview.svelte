<!--
	@component
	How an icon's picture looks on the slides: as a round guest button (the counting pages) and as
	the picture of a calendar day (the month page, under the observance's name). With no picture,
	or one that fails to load, each shows what the slides show instead.
-->
<script lang="ts">
	import Picture from '#lib/editor/Picture.svelte';
	import { CALENDAR_DEFAULT_PICTURE, GUEST_DEFAULT_PICTURE } from './icons.ts';

	interface Props {
		/** The picture ('' for none). */
		url: string;
		/** Shown in the calendar day, where the slide shows the observance's name. */
		name: string;
	}

	let { url, name }: Props = $props();

	let failedUrl = $state('');
	const calendarPicture = $derived(url && url !== failedUrl ? url : CALENDAR_DEFAULT_PICTURE);
</script>

<div class="flex flex-wrap items-start justify-center gap-3" aria-hidden="true">
	<figure class="flex flex-col items-center gap-1">
		<Picture src={url} fallback={GUEST_DEFAULT_PICTURE} class="size-20" />
		<figcaption class="text-xs opacity-80">Guest button</figcaption>
	</figure>
	<figure class="flex flex-col items-center gap-1">
		<!-- Like DayInMonth: the day number at the top right, the name on a strip at the bottom. -->
		<div
			class="border-surface-400-600 relative flex size-20 items-center justify-center overflow-hidden border bg-white text-black"
		>
			<img
				src={calendarPicture}
				alt=""
				draggable={false}
				class="max-h-full max-w-full"
				onerror={() => {
					if (calendarPicture !== CALENDAR_DEFAULT_PICTURE) failedUrl = calendarPicture;
				}}
			/>
			<span class="absolute top-0 right-0 rounded-bl-lg bg-white px-1 text-xs leading-none">
				14
			</span>
			<span
				class="absolute bottom-0 line-clamp-2 w-full bg-slate-100/60 text-center text-[0.65rem] leading-none break-words"
			>
				{name.trim() || 'Name'}
			</span>
		</div>
		<figcaption class="text-xs opacity-80">Calendar day</figcaption>
	</figure>
</div>
