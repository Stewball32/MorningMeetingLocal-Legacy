<script lang="ts">
	import type { PageData } from './$types';
	import { pb, updateClassDaily } from '#lib/pb/index.ts';
	import type { ClassDaily, IconRecord, GuestDaily, Person, PersonDaily } from '#lib/pb/types.ts';
	import { onDestroy, onMount } from 'svelte';
	import type { RecordSubscription } from 'pocketbase';
	import { updateSound } from '#lib/sounds.ts';
	import {
		applyPersonEvent,
		guestPeopleOf,
		studentsOf,
		teachersOf,
		visibleGuestDailies
	} from '#lib/slides/people.ts';
	import Attendance from '#lib/slides/attendance/+slide.svelte';
	import Calendar from '#lib/slides/calendar/+slide.svelte';

	let { data }: { data: PageData } = $props();

	const todayISOString = data.todayISOString;
	let classDaily: ClassDaily = $state(data.classDaily);
	// everyone, active or not; the lists below are what the slides show
	let people: Person[] = $state(data.people);
	let personDailyMap: Map<string, PersonDaily> = $state(data.personDailyMap);
	let guestDailies: GuestDaily[] = $state(data.guestDailies);
	let guestAvatarMap: Map<string, IconRecord> = data.guestAvatarMap;
	// let currentPerson: Person | undefined = $state(undefined);

	let peopleById: Map<string, Person> = $derived(new Map(people.map((p) => [p.id, p])));
	let students: Person[] = $derived(studentsOf(people));
	let teachers: Person[] = $derived(teachersOf(people));
	let guestPeople: Person[] = $derived(guestPeopleOf(people));
	let visibleGuests: GuestDaily[] = $derived(visibleGuestDailies(guestDailies, peopleById));

	let activeStudents: Person[] = $derived(
		students.some((student) => personDailyMap.get(student.id)?.here === 'present')
			? students.filter((student) => personDailyMap.get(student.id)?.here === 'present')
			: students.filter((student) => personDailyMap.get(student.id)?.here !== 'absent')
	);
	let activeTeachers: Person[] = $derived(
		teachers.some((teacher) => personDailyMap.get(teacher.id)?.here === 'present')
			? teachers.filter((teacher) => personDailyMap.get(teacher.id)?.here === 'present')
			: teachers.filter((teacher) => personDailyMap.get(teacher.id)?.here !== 'absent')
	);

	// let searchParams: URLSearchParams = $state(data.searchParams);
	// svelte-ignore state_referenced_locally
	let slide = $state(classDaily.slide ?? 0);

	onMount(async () => {
		pb.collection('class_dailies').subscribe(classDaily.id, (e: RecordSubscription<ClassDaily>) => {
			console.log('classDaily');
			if (e.record.date !== todayISOString) return;
			console.log('classDaily', e.action, e.record);
			if (e.action === 'update') {
				const newClassDaily = e.record;
				classDaily = newClassDaily;
			}
		});

		pb.collection('people_dailies').subscribe('*', (e: RecordSubscription<PersonDaily>) => {
			if (e.record.date !== todayISOString) return;
			const newPersonDailyMap = new Map(personDailyMap);
			switch (e.action) {
				case 'create':
					newPersonDailyMap.set(e.record.person, e.record);
					if (e.record.here) updateSound(e.record.person, e.record.here);
					break;
				case 'update': {
					const oldRecord = newPersonDailyMap.get(e.record.person);
					newPersonDailyMap.set(e.record.person, e.record);
					if (!e.record.here && oldRecord?.here) {
						updateSound(e.record.person, e.record.here);
					} else if (e.record.here && e.record.here !== oldRecord?.here) {
						updateSound(e.record.person, e.record.here);
					}
					break;
				}
				case 'delete':
					newPersonDailyMap.delete(e.record.person);
					break;
			}
			personDailyMap = newPersonDailyMap;
		});

		// edits made on the people page (names, pictures, active, is_guest) show up right away
		pb.collection('people').subscribe('*', (e: RecordSubscription<Person>) => {
			people = applyPersonEvent(people, e.action, e.record);
		});

		pb.collection('guest_dailies').subscribe('*', (e: RecordSubscription<GuestDaily>) => {
			if (e.record.date !== todayISOString) return;
			const newGuestDailies = [...guestDailies];
			switch (e.action) {
				case 'create':
					newGuestDailies.push(e.record);
					break;
				case 'update':
					const index = newGuestDailies.findIndex((g) => g.id === e.record.id);
					if (index !== -1) newGuestDailies[index] = e.record;
					break;
				case 'delete':
					const deleteIndex = newGuestDailies.findIndex((g) => g.id === e.record.id);
					if (deleteIndex !== -1) newGuestDailies.splice(deleteIndex, 1);
					break;
			}
			guestDailies = newGuestDailies;
		});

		onDestroy(() => {
			// sounds multiply if not removed (mainly in dev mode)
			pb.collection('people_dailies').unsubscribe('*');
			pb.collection('people').unsubscribe('*');
			pb.collection('guest_dailies').unsubscribe('*');
		});
	});

	const updateClassDailySlide = async (column: string, partialClassDaily: Partial<ClassDaily>) => {
		const newClassDaily: Partial<ClassDaily> = {};
		newClassDaily[column] = {
			...classDaily[column],
			...partialClassDaily
		};
		await updateClassDaily(newClassDaily);
	};

	const slideLeft = () => {
		if (slide > 0) {
			slide--;
			updateClassDaily({ slide });
		}
	};
	const slideRight = () => {
		if (slide < 1) {
			slide++;
			updateClassDaily({ slide });
		}
	};
</script>

{#if slide === 0}
	<Attendance
		{students}
		{teachers}
		{guestPeople}
		{peopleById}
		{classDaily}
		{personDailyMap}
		guestDailies={visibleGuests}
		{guestAvatarMap}
		{slideLeft}
		{slideRight}
		{updateClassDailySlide}
	/>
{:else if slide === 1}
	<Calendar
		{students}
		{teachers}
		{classDaily}
		{personDailyMap}
		guestDailies={visibleGuests}
		{guestAvatarMap}
		{slideLeft}
		{slideRight}
		{updateClassDailySlide}
	/>
{/if}
