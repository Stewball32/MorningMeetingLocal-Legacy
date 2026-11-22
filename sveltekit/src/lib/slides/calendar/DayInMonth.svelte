<script lang="ts">
	import type { Holiday } from '#lib/pb/calendar.ts';
	import type { AstronomyData } from './_types';
	import { MoonPhase } from 'astronomy-engine';
	import { onDestroy, onMount } from 'svelte';
	import MonthView from './MonthView.svelte';

	interface DayInMonthProps {
		day: number;
		month?: string;
		year: number;
		holidays: Holiday[];
		astronomyData: AstronomyData[];
		currentHoverDay?: number;
		inPast?: boolean;
		inCurrentMonth?: boolean;
		wasSelected?: boolean;
		isToday?: boolean;
		todayChosen?: boolean;
		isDisabled?: boolean;
		onHover?: (day: number) => void;
		onClick?: (day: number) => void;
		getDayClass?: (day: number) => string;
	}

	let {
		day,
		month = '',
		year = new Date().getFullYear(),
		holidays = [],
		astronomyData = [],
		currentHoverDay = 0,
		inPast = false,
		inCurrentMonth = true,
		wasSelected = false,
		isToday = false,
		todayChosen = false,
		isDisabled = false,
		onHover = (day: number) => {},
		onClick = (day: number) => {},
		getDayClass = (day: number) => ''
	}: DayInMonthProps = $props();

	let baseBtnClass =
		'btn relative h-full p-0 cursor-pointer select-auto overflow-hidden rounded-none border ';
	let buttonTodayChosenClass = $derived(isToday && todayChosen ? 'z-2 outline-3 ' : '');
	let buttonClass = $derived(`${getDayClass(day)} ${buttonTodayChosenClass} ${baseBtnClass}`);

	let baseDayClass = 'text-size-0 pl-[2%] leading-none absolute z-10 right-[0%] top-0 rounded-bl-lg';
	let dayHoverClass = $derived(currentHoverDay == day ? 'font-bold' : '');
	let dayTodayChosenClass = $derived(
		isToday && todayChosen ? 'bg-black text-white font-black' : 'bg-white text-black font-normal '
	);
	let dayClass = $derived(`${baseDayClass} ${dayHoverClass} ${dayTodayChosenClass}`);

	let inPastClass = $derived(inPast ? 'opacity-75' : 'opacity-25');

	let baseHolidayClass = 'm-0 max-h-full max-w-full overflow-hidden p-0';
	let holidayClass = $derived(`${baseHolidayClass} ${inPastClass}`);

	const baseAstronomyClass = 'flex absolute z-10 left-[2%] top-0 h-[25%] overflow-hidden';
	let astronomyClass = $derived(`${baseAstronomyClass} ${inPastClass}`);

	let holidayIndex = $state(0);
	let holidayTimer: ReturnType<typeof setInterval>;

	$effect(() => {
		if (holidays.length < 2) return clearInterval(holidayTimer);
		holidayTimer = setInterval(() => {
			holidayIndex = (holidayIndex + 1) % holidays.length;
		}, 3000);
	});

	let astronomyIndex = $state(0);
	let astronomyTimer: ReturnType<typeof setInterval>;
	$effect(() => {
		if (astronomyData.length < 2) return clearInterval(astronomyTimer);
		astronomyTimer = setInterval(() => {
			astronomyIndex = (astronomyIndex + 1) % astronomyData.length;
		}, 3000);
	});

	onDestroy(() => {
		clearInterval(holidayTimer);
	});
</script>

<button
	onmouseenter={() => onHover(day)}
	onmouseleave={() => onHover(0)}
	onclick={() => onClick(day)}
	disabled={isDisabled}
	class={buttonClass}
>
	{#if astronomyData && astronomyData.length > 0}
		<img
			src={astronomyData[astronomyIndex].imgSrc}
			alt={astronomyData[astronomyIndex].name}
			class={astronomyClass}
			onerror={(e) => {
				(e.currentTarget as HTMLImageElement).src = '/defaults/astronomy.png';
			}}
		/>
	{/if}
	<span class={dayClass}>
		{day}
	</span>
	{#if holidays && holidays.length > 0}
		<img
			src={holidays[holidayIndex]?.image}
			alt={holidays[holidayIndex].name}
			class={holidayClass}
			onerror={(e) => {
				(e.currentTarget as HTMLImageElement).src = '/defaults/calendar.png';
			}}
		/>
			<span
				class="text-size-00 absolute bottom-0 line-clamp-3 max-h-4/5 w-full bg-slate-100/60 pb-[1%] text-center leading-none text-wrap lg:pb-0"
			>
				{holidays[holidayIndex].name}
			</span>
		{#if !holidays.every((h) => !h.school || h.school == 'full')}
			<span class="text-size-00 bg-slate-100/60 z-1 text-error-700-300 font-black rounded-b-lg absolute top-0 truncate  px-[2%] leading-none">
				{holidays.some((h) => h.school === 'none') ? 'No School!' : 'Short Day!'}
			</span>
		{/if}
	{/if}
</button>
