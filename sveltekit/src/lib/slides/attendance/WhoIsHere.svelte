<script lang="ts">
	import type { Person, PersonDaily } from '#lib/pb/types.ts';
	import type { ClassProps } from './_types';
	import { getPronounPresent, getPronounSubject } from '#lib';
	import PersonBar from '#lib/slides/attendance/PersonBar.svelte';
	import PersonButton from '#lib/buttons/PersonButton.svelte';
	import { DEFAULT_AVATAR, guestPictureUrl } from '#lib/slides/people.ts';
	import { releaseVideoFocus, youtubeEmbedUrl, youtubeWatchUrl } from './video.ts';

	interface WhoIsHereProps {
		from?: 'left' | 'right';
		people: Person[];
		dailyMap: Map<string, PersonDaily>;
		updateAttendance: (person: Person | undefined, isHere: boolean) => Promise<void>;
		currentPerson: Person | undefined;
		title?: string;
		subtitle?: string;
		prompt?: string;
		pageLeft?: () => void;
		pageRight?: () => void;
		updateClassDailySlide: (
			column: string,
			partialClassDaily: Partial<ClassProps>
		) => Promise<void>;
	}

	let {
		people,
		dailyMap,
		updateAttendance,
		currentPerson = $bindable(undefined),
		title = 'Attendance',
		subtitle = 'Part 1: Students',
		prompt = 'Click on a button!',
		pageLeft = () => {},
		pageRight = () => {},
		updateClassDailySlide = async (column: string, partialClassDaily: Partial<ClassProps>) => {}
	}: WhoIsHereProps = $props();

	const youtubeUrl = (person: Person, embedded: boolean = true) => {
		const clip = { id: person.video_id ?? '', start: person.video_start, end: person.video_end };
		return embedded ? youtubeEmbedUrl(clip) : youtubeWatchUrl(clip);
	};

	const updateCurrentPerson = (person?: Person) => {
		currentPerson = person;
		const partial = {
			currentPerson: person?.id
		};
		updateClassDailySlide('attendance', partial);
	};

	// The current person is shared by the student and teacher pages; each page only shows them
	// (and lets the up/down keys set their attendance) when they are one of its people. Taking
	// them from `people` also picks up live edits (name, picture, video) from the people page.
	let pagePerson: Person | undefined = $derived(
		currentPerson ? people.find((p) => p.id === currentPerson?.id) : undefined
	);

	const getPersonIndex = (person: Person) => {
		return people.findIndex((p) => p.id === person.id);
	};

	const getButtonPreset = (person: Person) => {
		const daily = dailyMap.get(person.id);
		if (!daily) return 'surface';
		if (daily.here === 'present') return 'success';
		if (daily.here === 'absent') return 'error';
		return 'surface';
	};

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			if (!pagePerson) return;
			updateAttendance(pagePerson, true);
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			if (!pagePerson) return;
			updateAttendance(pagePerson, false);
		}
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			let newPerson: Person | undefined;
			if (currentPerson === undefined) {
				newPerson = people[people.length - 1];
			} else {
				const currentPersonIndex = getPersonIndex(currentPerson);
				if (currentPersonIndex === -1) newPerson = people[people.length - 1];
				else newPerson = people[currentPersonIndex - 1];
			}
			if (!newPerson) return pageLeft();
			updateCurrentPerson(newPerson);
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			let newPerson: Person | undefined;
			if (currentPerson === undefined) {
				newPerson = people[0];
			} else {
				const currentPersonIndex = getPersonIndex(currentPerson);
				if (currentPersonIndex === -1) newPerson = people[0];
				else newPerson = people[currentPersonIndex + 1];
			}
			if (!newPerson) return pageRight();
			updateCurrentPerson(newPerson);
		}
	}
</script>

<!-- the legacy on: syntax, like the keydown handler (the two can't be mixed in one component) -->
<svelte:window on:keydown={onKeydown} on:blur={releaseVideoFocus} />

<PersonBar {people} {dailyMap} {currentPerson} onClick={updateCurrentPerson} />
{#if pagePerson}
	<div class="h-8/12 top-2/12 absolute flex w-full flex-col justify-center py-2">
		<div class="h-9/12 flex w-full items-center justify-center pb-2">
			{#if pagePerson.video_id}
				<!--iFrame of youtube video with 16/9 ratio-->
				<iframe
					class="aspect-video h-full rounded-4xl"
					src={youtubeUrl(pagePerson)}
					title="YouTube video player"
					frameborder="0"
					allowfullscreen
				></iframe>
			{:else}
				<!-- no welcome video: their picture, large (the name is right below) -->
				<img
					class="aspect-square h-full rounded-4xl object-cover"
					src={guestPictureUrl(pagePerson, null)}
					alt=""
					draggable={false}
					onerror={(e) => {
						const img = e.currentTarget as HTMLImageElement;
						if (!img.src.endsWith(DEFAULT_AVATAR)) img.src = DEFAULT_AVATAR;
					}}
				/>
			{/if}
		</div>
		<div class="h-3/12 flex w-full items-center justify-center gap-2">
			<h1 class="text-size-6 font-bold">Is</h1>
			<PersonButton
				person={pagePerson}
				buttonPreset={getButtonPreset(pagePerson)}
				buttonClass="h-full"
				avatarClass="-px-6"
				nameClass="text-size-6 font-bold"
				onClick={() => updateCurrentPerson(undefined)}
			/>
			<h1 class="text-size-6 font-bold">here today?</h1>
		</div>
	</div>

	<div class="h-2/12 absolute bottom-0 flex w-full justify-evenly pt-1">
		<button
			onclick={() => updateAttendance(pagePerson, true)}
			class="btn preset-filled-success-500 text-size-4 col-span-2 w-1/4 rounded-full border font-semibold"
		>
			{getPronounSubject(pagePerson)}
			{getPronounPresent(pagePerson)}
			here!
		</button>
		{#if pagePerson.video_id}
			<a
				href={youtubeUrl(pagePerson, false)}
				target="_blank"
				rel="noopener noreferrer"
				class="btn col-span-1 overflow-hidden rounded-full"
			>
				<img class="h-full rounded-full" src="/youtube.png" alt="" />
			</a>
		{/if}
		<button
			onclick={() => updateAttendance(pagePerson, false)}
			class="btn preset-filled-error-500 text-size-4 col-span-2 w-1/4 rounded-full border font-semibold"
		>
			{getPronounSubject(pagePerson)}
			{getPronounPresent(pagePerson) + "n't"}
			here.
		</button>
	</div>
{:else}
	<div class="h-10/12 top-2/12 absolute flex w-full cursor-default flex-col justify-center py-2">
		<div class="flex h-full w-full flex-col items-center justify-around">
			<h1 class="text-size-8 text-center font-black">{title}</h1>
			<h2 class="text-size-7 text-normal text-balance text-center font-extrabold">{subtitle}</h2>
			<h3 class="text-size-4 hidden text-balance py-[5%] text-center font-semibold italic sm:block">
				{prompt}
			</h3>
		</div>
	</div>
{/if}
