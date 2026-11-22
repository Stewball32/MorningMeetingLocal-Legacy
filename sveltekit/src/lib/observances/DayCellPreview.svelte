<!--
	@component
	What a day looks like on the calendar slide's month page (DayInMonth): the picture, the day
	number, the "No School!" / "Short Day!" badge and the name. A sketch at a fixed size, for the
	form; the slide's own cell grows with the screen.
-->
<script lang="ts">
	import type { School } from '#lib/pb/calendar.ts';
	import { DEFAULT_PICTURE, SLIDE_BADGE } from './observances.ts';

	interface Props {
		/** '' for the default picture. */
		picture: string;
		name: string;
		school: School;
		/** The day of the month shown in the corner. */
		day?: number;
		class?: string;
	}

	let { picture, name, school, day = 1, class: className = '' }: Props = $props();

	let failed = $state('');
	const shown = $derived(picture && picture !== failed ? picture : DEFAULT_PICTURE);
</script>

<div
	class="relative flex h-28 w-44 shrink-0 items-center justify-center overflow-hidden rounded-sm border-2 border-gray-400 bg-gray-200 text-black {className}"
	aria-hidden="true"
>
	<img
		src={shown}
		alt=""
		draggable={false}
		class="max-h-full max-w-full opacity-75"
		onerror={() => {
			if (shown !== DEFAULT_PICTURE) failed = shown;
		}}
	/>
	<span class="absolute top-0 right-0 z-10 rounded-bl-lg bg-white pl-1 text-sm leading-none">
		{day}
	</span>
	{#if SLIDE_BADGE[school]}
		<span
			class="text-error-700-300 absolute top-0 z-1 truncate rounded-b-lg bg-slate-100/60 px-1 text-xs leading-none font-black"
		>
			{SLIDE_BADGE[school]}
		</span>
	{/if}
	<span
		class="absolute bottom-0 line-clamp-3 w-full bg-slate-100/60 text-center text-xs leading-none text-wrap"
	>
		{name}
	</span>
</div>
