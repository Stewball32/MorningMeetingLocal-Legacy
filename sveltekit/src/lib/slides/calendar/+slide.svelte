<script lang="ts">
	import type { ClassDaily, IconRecord, GuestDaily, Person, PersonDaily } from '#lib/pb/types.ts';
	import NavArrows from '../NavArrows.svelte';
	import FindTheDate from './FindTheDate.svelte';
	import MonthView from './MonthView.svelte';
	import type { ClassProps, Month, Weekday } from './_types';

	interface SlideProps {
		students: Person[];
		teachers: Person[];
		classDaily: ClassDaily;
		personDailyMap: Map<string, PersonDaily>;
		guestDailies: GuestDaily[];
		guestAvatarMap: Map<string, IconRecord>;
		slideLeft: () => void;
		slideRight: () => void;
		updateClassDailySlide: (
			column: string,
			partialClassDaily: Partial<ClassDaily>
		) => Promise<void>;
	}

	let {
		students = $bindable([]),
		teachers = $bindable([]),
		classDaily = $bindable({} as ClassDaily),
		personDailyMap = $bindable(new Map<string, PersonDaily>()),
		guestDailies = $bindable([]),
		guestAvatarMap = $bindable(new Map<string, IconRecord>()),
		slideLeft = () => {},
		slideRight = () => {},
		updateClassDailySlide = async (column: string, partialClassDaily: Partial<ClassDaily>) => {}
	}: SlideProps = $props();

	let calendarProps: ClassProps = $state(classDaily.calendar ?? ({} as ClassProps));
	let page = $state(calendarProps?.page ?? 0);
	let currentCheck = $state(classDaily?.calendar?.currentCheck);
	let weekdayGuesses: Weekday[] = $state(classDaily?.calendar?.weekdayGuesses ?? []);
	let monthGuesses: Month[] = $state(classDaily?.calendar?.monthGuesses ?? []);
	let dayGuesses = $state(classDaily?.calendar?.dayGuesses ?? []);
	let yearGuesses = $state(classDaily?.calendar?.yearGuesses ?? []);
	let calendarGuesses = $state(classDaily?.calendar?.calendarGuesses ?? []);
	let dayOpt;
	let startWithSunday = $state(true);

	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);

	const todayWeekday = today.toLocaleString('en-US', { weekday: 'long' }) as Weekday;
	const yesterdayWeekday: Weekday = yesterday.toLocaleString('en-US', {
		weekday: 'long'
	}) as Weekday;
	const todayDay = today.getDate();
	const yesterdayDay = yesterday.getDate();
	const todayMonth = today.toLocaleString('en-US', { month: 'long' }) as Month;
	const yesterdayMonth = yesterday.toLocaleString('en-US', { month: 'long' }) as Month;
	const todayYear = today.getFullYear();
	const yesterdayYear = yesterday.getFullYear();

	let weekdayBackgrounds = {
		Sunday: 'bg-red-300',
		Monday: 'bg-orange-300',
		Tuesday: 'bg-yellow-300',
		Wednesday: 'bg-green-300',
		Thursday: 'bg-blue-300',
		Friday: 'bg-indigo-300',
		Saturday: 'bg-violet-300'
	};

	let weekdayTextColors = {
		Sunday: 'text-red-300',
		Monday: 'text-orange-300',
		Tuesday: 'text-yellow-300',
		Wednesday: 'text-green-300',
		Thursday: 'text-blue-300',
		Friday: 'text-indigo-300',
		Saturday: 'text-violet-300'
	};

	let totalSlides = 2; // total number of slides
	const pageLeft = () => {
		if (page > 0) {
			page--;
			updateClassDailySlide('calendar', { page });
		} else slideLeft();
	};
	const pageRight = () => {
		if (page < totalSlides - 1) {
			page++;
			updateClassDailySlide('calendar', { page });
		} else {
			slideRight();
		}
	};
</script>

<NavArrows
	{classDaily}
	{page}
	{totalSlides}
	rightDisabled={page == totalSlides - 1}
	{pageLeft}
	{pageRight}
/>

{#if page === 0}
	<FindTheDate
		{classDaily}
		{today}
		{todayWeekday}
		{yesterdayWeekday}
		{todayDay}
		{yesterdayDay}
		{todayMonth}
		{yesterdayMonth}
		{todayYear}
		{yesterdayYear}
		{currentCheck}
		{weekdayGuesses}
		{yearGuesses}
		{monthGuesses}
		{dayGuesses}
		{startWithSunday}
		{weekdayBackgrounds}
		{weekdayTextColors}
		{pageLeft}
		{pageRight}
		{updateClassDailySlide}
	/>
{:else if page === 1}
	<MonthView
		{classDaily}
		{startWithSunday}
		{calendarGuesses}
		{todayDay}
		{today}
		{weekdayBackgrounds}
		{pageLeft}
		{pageRight}
		{updateClassDailySlide}
	/>
{/if}
