<script lang="ts">
	import type { PageData } from './$types';
	import {
		findClassDaily,
		getAllPeople,
		getClassDaily,
		getGuestDailiesDate,
		getIconMap,
		getPersonDailyMap,
		pb,
		saveClassDaily
	} from '#lib/pb/index.ts';
	import type { ClassDaily, IconRecord, GuestDaily, Person, PersonDaily } from '#lib/pb/types.ts';
	import { onMount } from 'svelte';
	import type { RecordSubscription } from 'pocketbase';
	import { updateSound } from '#lib/sounds.ts';
	import {
		applyPersonEvent,
		guestPeopleOf,
		studentsOf,
		teachersOf,
		visibleGuestDailies
	} from '#lib/slides/people.ts';
	import { ClassDailySync } from '#lib/present/classDaily.ts';
	import { watchDay } from '#lib/present/dayWatch.ts';
	import { isUnreachable } from '#lib/present/saveError.ts';
	import { clearSaveError, reportSaveError, saveStatus } from '#lib/present/saveStatus.svelte.ts';
	import { Subscriptions } from '#lib/present/subscriptions.ts';
	import Attendance from '#lib/slides/attendance/+slide.svelte';
	import Calendar from '#lib/slides/calendar/+slide.svelte';

	let { data }: { data: PageData } = $props();

	// The presenter works on the day it was loaded for, from a copy of the load data that realtime
	// events keep up to date. When the date changes, watchDay reloads the page.
	// svelte-ignore state_referenced_locally
	const { todayISOString } = data;
	// svelte-ignore state_referenced_locally
	const loaded = data;
	// no record yet on a new day: the page creates it (sync.flush below)
	const emptyClassDaily = { id: '', date: todayISOString } as ClassDaily;
	// raw: the slides follow it as a whole, and unchanged parts keep their identity
	let classDaily: ClassDaily = $state.raw(loaded.classDaily ?? emptyClassDaily);
	// everyone, active or not; the lists below are what the slides show
	let people: Person[] = $state(loaded.people);
	let personDailyMap: Map<string, PersonDaily> = $state(loaded.personDailyMap);
	let guestDailies: GuestDaily[] = $state(loaded.guestDailies);
	// every icon by id (the Add Guest list only offers the ones for guests)
	let guestAvatarMap: Map<string, IconRecord> = $state(loaded.guestAvatarMap);
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

	// Every change is shown right away and saved in order, by the record's id (see ClassDailySync).
	const sync = new ClassDailySync<ClassDaily>({
		initial: loaded.classDaily ?? emptyClassDaily,
		ensure: () => getClassDaily(todayISOString),
		write: saveClassDaily,
		onChange: (record) => (classDaily = record),
		// an unsaved change is sent again when the connection comes back (see reloadToday)
		onError: (error) => reportSaveError(error, undefined, isUnreachable(error)),
		onSaved: clearSaveError
	});

	// let searchParams: URLSearchParams = $state(data.searchParams);
	let slide = $state(sync.current.slide ?? 0);

	// Bumped by every realtime event, so a refetch that started before an event doesn't undo it.
	const changes = { people: 0, personDailies: 0, guestDailies: 0, icons: 0 };
	const refetch = async <T,>(
		key: keyof typeof changes,
		fetch: () => Promise<T>,
		apply: (value: T) => void
	) => {
		for (let attempt = 0; attempt < 3; attempt++) {
			const before = changes[key];
			const value = await fetch();
			if (changes[key] === before) return apply(value);
		}
	};
	// After the realtime connection (re)connects: changes made while it was down were missed.
	const reloadToday = async () => {
		try {
			await Promise.all([
				refetch('people', getAllPeople, (value) => (people = value)),
				refetch(
					'personDailies',
					() => getPersonDailyMap(todayISOString),
					(value) => (personDailyMap = value)
				),
				refetch(
					'guestDailies',
					() => getGuestDailiesDate(todayISOString),
					(value) => (guestDailies = value)
				),
				refetch('icons', getIconMap, (value) => (guestAvatarMap = value)),
				sync.unsaved.length || !sync.current.id
					? sync.flush()
					: findClassDaily(todayISOString).then((record) => record && sync.receive(record))
			]);
		} catch (error) {
			console.error("Couldn't reload today's data:", error);
		}
	};

	onMount(() => {
		const subscriptions = new Subscriptions();
		subscriptions.add('class_dailies/*', () =>
			pb.collection('class_dailies').subscribe('*', (e: RecordSubscription<ClassDaily>) => {
				if (e.action === 'create' || e.action === 'update') sync.receive(e.record);
			})
		);

		subscriptions.add('people_dailies/*', () =>
			pb.collection('people_dailies').subscribe('*', (e: RecordSubscription<PersonDaily>) => {
				if (e.record.date !== todayISOString) return;
				changes.personDailies++;
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
			})
		);

		// edits made on the people page (names, pictures, active, is_guest) show up right away
		subscriptions.add('people/*', () =>
			pb.collection('people').subscribe('*', (e: RecordSubscription<Person>) => {
				changes.people++;
				people = applyPersonEvent(people, e.action, e.record);
			})
		);

		subscriptions.add('guest_dailies/*', () =>
			pb.collection('guest_dailies').subscribe('*', (e: RecordSubscription<GuestDaily>) => {
				if (e.record.date !== todayISOString) return;
				changes.guestDailies++;
				const newGuestDailies = [...guestDailies];
				switch (e.action) {
					case 'create':
						newGuestDailies.push(e.record);
						break;
					case 'update': {
						const index = newGuestDailies.findIndex((g) => g.id === e.record.id);
						if (index !== -1) newGuestDailies[index] = e.record;
						break;
					}
					case 'delete': {
						const deleteIndex = newGuestDailies.findIndex((g) => g.id === e.record.id);
						if (deleteIndex !== -1) newGuestDailies.splice(deleteIndex, 1);
						break;
					}
				}
				guestDailies = newGuestDailies;
			})
		);

		// icons added, changed or removed on the Icons page show up in the guest list and buttons
		subscriptions.add('icons/*', () =>
			pb.collection('icons').subscribe('*', (e: RecordSubscription<IconRecord>) => {
				changes.icons++;
				const icons = new Map(guestAvatarMap);
				if (e.action === 'delete') icons.delete(e.record.id);
				else icons.set(e.record.id, e.record);
				guestAvatarMap = icons;
			})
		);

		subscriptions.add('PB_CONNECT', () => pb.realtime.subscribe('PB_CONNECT', reloadToday));

		// a new day: create today's record now, so every screen shares it from the start
		if (!sync.current.id) sync.flush();

		const stopWatchingDay = watchDay({ pageDate: todayISOString });
		return () => {
			stopWatchingDay();
			// sounds multiply if not removed (mainly in dev mode)
			subscriptions.stop();
		};
	});

	const updateClassDailySlide = async (column: string, partialClassDaily: Partial<ClassDaily>) => {
		await sync.updateColumn(column, partialClassDaily);
	};

	const slideLeft = () => {
		if (slide > 0) {
			slide--;
			sync.update({ slide });
		}
	};
	const slideRight = () => {
		if (slide < 1) {
			slide++;
			sync.update({ slide });
		}
	};
</script>

{#if saveStatus.message}
	<div
		role="status"
		class="preset-filled-warning-500 absolute top-1 left-1/2 z-20 flex max-w-[80%] -translate-x-1/2 items-center gap-2 rounded-full px-4 py-1 text-sm shadow-lg"
	>
		<span>{saveStatus.message}</span>
		<button
			type="button"
			class="btn-icon size-6 rounded-full font-bold hover:bg-black/10"
			aria-label="Close this message"
			onclick={clearSaveError}
		>
			×
		</button>
	</div>
{/if}

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
