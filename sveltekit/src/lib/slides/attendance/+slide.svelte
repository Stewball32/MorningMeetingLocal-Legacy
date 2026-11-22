<script lang="ts">
	import { updatePersonDaily } from '#lib/pb/index.ts';
	import type { ClassDaily, IconRecord, GuestDaily, Person, PersonDaily } from '#lib/pb/types.ts';
	import { displayName } from '#lib/people/people.ts';
	import { isNewer } from '#lib/present/classDaily.ts';
	import { clearSaveError, reportSaveError } from '#lib/present/saveStatus.svelte.ts';
	import { onMount } from 'svelte';
	import WhoIsHere from '#lib/slides/attendance/WhoIsHere.svelte';
	import type { ClassProps, MathClassProps } from './_types';
	import PeopleAddition from './PeopleAddition.svelte';
	import PeopleSubtraction from './PeopleSubtraction.svelte';
	import GuestCheck from './GuestCheck.svelte';
	import NavArrows from '../NavArrows.svelte';

	interface SlideProps {
		students: Person[]; // shown on the student page
		teachers: Person[]; // shown on the teacher page
		guestPeople: Person[]; // offered in the Add Guest list
		peopleById: Map<string, Person>; // everyone, active or not
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
		guestPeople = [],
		peopleById = new Map<string, Person>(),
		classDaily = $bindable({} as ClassDaily),
		personDailyMap = $bindable(new Map<string, PersonDaily>()),
		guestDailies = $bindable([]),
		guestAvatarMap = $bindable(new Map<string, IconRecord>()),
		slideLeft = () => {},
		slideRight = () => {},
		updateClassDailySlide = async (column: string, partialClassDaily: Partial<ClassDaily>) => {}
	}: SlideProps = $props();

	let currentPerson: Person | undefined = $state(undefined);
	let attendanceDaily = $derived(classDaily.attendance ?? ({} as ClassProps));
	// each screen keeps its own page (a second screen doesn't jump along); it starts on the saved one
	let page = $state(classDaily?.attendance?.page ?? 0);
	let studentMath: MathClassProps = $derived(attendanceDaily.studentMath || ({} as MathClassProps));
	let peopleMath: MathClassProps = $derived(attendanceDaily.peopleMath || ({} as MathClassProps));
	// the guest page's answers follow the saved state, so they survive page changes (and other
	// screens show them too)
	let hasGuests: boolean | undefined = $derived(attendanceDaily.hasGuests ?? undefined);
	let welcomeGuests: boolean = $derived(attendanceDaily.welcomeGuests ?? false);

	onMount(async () => {
		const personId = attendanceDaily.currentPerson; // id string
		if (personId) {
			// the student and teacher pages each only show the current person if they are theirs
			const person = peopleById.get(personId);
			if (person) {
				currentPerson = person;
			}
		}
	});

	// One person's saves go out one at a time, and each works out the toggle from the newest record
	// (the realtime map, or the previous save's result while its echo is still on the way).
	// (plain objects: nothing on screen depends on them)
	const saving: Record<string, Promise<void> | undefined> = {};
	const lastSaved: Record<string, PersonDaily | undefined> = {};
	const newestDaily = (personId: string) => {
		const shown = personDailyMap.get(personId);
		const saved = lastSaved[personId];
		return saved && (!shown || isNewer(saved, shown)) ? saved : shown;
	};

	const updateAttendance = async (person: Person | undefined, isHere: boolean) => {
		if (!person) {
			console.error('No person provided to update attendance.');
			return;
		}
		// the presenter's day (a screen left open overnight reloads itself; until then it stays on
		// the day it shows)
		const date = classDaily.date;
		const save = async () => {
			const daily = newestDaily(person.id);
			let here: 'present' | 'absent' | '' = '';
			switch (daily?.here) {
				case 'present':
					here = isHere ? '' : 'absent';
					break;
				case 'absent':
					here = isHere ? 'present' : '';
					break;
				default:
					here = isHere ? 'present' : 'absent';
					break;
			}
			try {
				lastSaved[person.id] = await updatePersonDaily(person, { date, here, known: daily });
				clearSaveError(`attendance:${person.id}`);
			} catch (error) {
				reportSaveError(
					error,
					`${displayName(person)}'s attendance`,
					false,
					`attendance:${person.id}`
				);
			}
		};
		const next = (saving[person.id] ?? Promise.resolve()).then(save);
		saving[person.id] = next;
		await next;
		if (saving[person.id] === next) delete saving[person.id];
	};

	let totalSlides = 5; // total number of slides
	const pageLeft = () => {
		if (page > 0) {
			page--;
			updateClassDailySlide('attendance', { page });
		} else slideLeft();
	};
	const pageRight = () => {
		if (page < totalSlides - 1) {
			page++;
			updateClassDailySlide('attendance', { page });
		} else {
			slideRight();
		}
	};
</script>

<NavArrows {classDaily} {page} {totalSlides} leftDisabled={page == 0} {pageLeft} {pageRight} />

{#if page === 0}
	<WhoIsHere
		people={students}
		dailyMap={personDailyMap}
		{updateAttendance}
		bind:currentPerson
		title="Let's Take Attendance!"
		subtitle="Which students are here today?"
		prompt="Click on a student's button above."
		{pageLeft}
		{pageRight}
		{updateClassDailySlide}
	/>
{:else if page === 1}
	<PeopleSubtraction
		peopleTogetherName="Students"
		peopleSubtracted={students.filter((s) => personDailyMap.get(s.id)?.here === 'absent')}
		peopleSubtractedName="Absent"
		peopleRemaining={students.filter((s) => personDailyMap.get(s.id)?.here === 'present')}
		peopleRemainingName="Here"
		title="How Many Students?"
		mathProps={studentMath}
		mathPropsName="studentMath"
		{pageLeft}
		{pageRight}
		{updateClassDailySlide}
	/>
{:else if page === 2}
	<WhoIsHere
		people={teachers}
		dailyMap={personDailyMap}
		{updateAttendance}
		bind:currentPerson
		title="Attendance: Part 2!"
		subtitle="Which teachers are here today?"
		prompt="Click on a teacher's button above."
		{pageLeft}
		{pageRight}
		{updateClassDailySlide}
	/>
{:else if page === 3}
	<GuestCheck
		{hasGuests}
		{guestDailies}
		{welcomeGuests}
		{guestAvatarMap}
		{guestPeople}
		{peopleById}
		{pageLeft}
		{pageRight}
		{updateClassDailySlide}
	/>
{:else if page === 4}
	<PeopleAddition
		peopleOne={students.filter((s) => personDailyMap.get(s.id)?.here === 'present')}
		peopleOneName="Students"
		peopleTwo={[
			...teachers.filter((s) => personDailyMap.get(s.id)?.here === 'present'),
			...guestDailies
		]}
		peopleTwoName="Teachers"
		resultName="Total"
		title="How Many People?"
		mathProps={peopleMath}
		mathPropsName="peopleMath"
		{guestAvatarMap}
		{peopleById}
		{pageLeft}
		{pageRight}
		{updateClassDailySlide}
	/>
{/if}
