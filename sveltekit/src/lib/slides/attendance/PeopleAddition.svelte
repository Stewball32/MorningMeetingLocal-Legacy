<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import type { IconRecord, GuestDaily, Student, Teacher } from '#lib/pb/types.ts';
	import PersonButton from '#lib/buttons/PersonButton.svelte';
	import { Popover, Portal, Switch } from '@skeletonlabs/skeleton-svelte';

	// import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Hash from '@lucide/svelte/icons/hash';
	import GripHorizontal from '@lucide/svelte/icons/grip-horizontal';
	import type { ClassProps, MathClassProps } from './_types';
	import GuestButton from '#lib/buttons/GuestButton.svelte';
	import { updateSound } from '#lib/sounds.ts';
	import ResetSlide from '#lib/slides/ResetSlide.svelte';

	interface PeopleMathProps {
		from?: 'left' | 'right';
		peopleOne: (Student | Teacher | GuestDaily)[];
		peopleOneName?: string;
		peopleTwo: (Student | Teacher | GuestDaily)[];
		peopleTwoName?: string;
		resultName?: string;
		mathProps?: MathClassProps;
		mathPropsName: 'studentMath' | 'peopleMath';
		title?: string;
		subtitle?: string;
		guestAvatarMap?: Map<string, IconRecord>;
		pageLeft?: () => void;
		pageRight?: () => void;
		updateClassDailySlide: (
			column: string,
			partialClassDaily: Partial<ClassProps>
		) => Promise<void>;
	}

	let {
		peopleOne,
		peopleOneName: oneName,
		peopleTwo,
		peopleTwoName: twoName,
		resultName,
		mathProps,
		mathPropsName,
		guestAvatarMap,
		title,
		subtitle,
		pageLeft = () => {},
		pageRight = () => {},
		updateClassDailySlide = async (column: string, partialClassDaily: Partial<ClassProps>) => {}
	}: PeopleMathProps = $props();

	// svelte-ignore state_referenced_locally
	const peopleResult: Student[] | Teacher[] = peopleOne
		.filter((p1) => !peopleTwo.some((p2) => p2.id === p1.id))
		.concat(peopleTwo);

	const optionsPerQuestion: number = 4;

	let oneAnswer = $derived(peopleOne.length);
	// svelte-ignore state_referenced_locally
	let oneOptDist = $state(mathProps?.oneOptDist ?? 0);
	let oneAnsIndex = $derived(Math.round(oneOptDist * (optionsPerQuestion - 1)));
	let oneStart = $derived(oneAnswer - oneAnsIndex > 0 ? oneAnswer - oneAnsIndex : 0);
	let oneOptions: number[] = $derived(
		Array.from({ length: optionsPerQuestion }, (_, i) => oneStart + i)
	);

	let twoAnswer = $derived(peopleTwo.length);
	// svelte-ignore state_referenced_locally
	let twoOptDist = $state(mathProps?.twoOptDist ?? 0);
	let twoAnsIndex = $derived(Math.round(twoOptDist * (optionsPerQuestion - 1)));
	let twoStart = $derived(twoAnswer - twoAnsIndex > 0 ? twoAnswer - twoAnsIndex : 0);
	let twoOptions: number[] = $derived(
		Array.from({ length: optionsPerQuestion }, (_, i) => twoStart + i)
	);

	let resultAnswer = $derived(peopleResult.length);
	// svelte-ignore state_referenced_locally
	let resultOptDist = $state(mathProps?.resultOptDist ?? 0);
	let resultAnsIndex = $derived(Math.round(resultOptDist * (optionsPerQuestion - 1)));
	let resultStart = $derived(resultAnswer - resultAnsIndex > 0 ? resultAnswer - resultAnsIndex : 0);
	let resultOptions: number[] = $derived(
		Array.from({ length: optionsPerQuestion }, (_, i) => resultStart + i)
	);

	// svelte-ignore state_referenced_locally
	let showHintOne = $state(mathProps?.showHintOne ?? true);
	// svelte-ignore state_referenced_locally
	let showHintTwo = $state(mathProps?.showHintTwo ?? true);
	// svelte-ignore state_referenced_locally
	let showHintResult = $state(mathProps?.showHintResult ?? false);

	onMount(async () => {
		let partial: Partial<ClassProps> = {};
		partial[mathPropsName] = { ...mathProps };
		let updatePartial = false;
		if (!oneOptDist) {
			oneOptDist = Math.floor(Math.random() * 100) / 100;
			partial[mathPropsName].oneOptDist = oneOptDist;
			updatePartial = true;
			console.log('partialOne', partial);
		}
		if (!twoOptDist) {
			twoOptDist = Math.floor(Math.random() * 100) / 100;
			partial[mathPropsName].twoOptDist = twoOptDist;
			updatePartial = true;
			console.log('partialTwo', partial);
		}
		if (!resultOptDist) {
			resultOptDist = Math.floor(Math.random() * 100) / 100;
			partial[mathPropsName].resultOptDist = resultOptDist;
			updatePartial = true;
			console.log('partialResult', partial);
		}
		if (updatePartial) {
			await updateClassDailySlide('attendance', partial);
		}
	});

	// svelte-ignore state_referenced_locally
	let oneGuesses: number[] = $state(mathProps?.oneGuesses ?? []);
	let oneSelected: number | undefined = $derived(oneGuesses[0] ?? undefined);
	let openStateOne = $state(false);
	function popoverOneClose() {
		openStateOne = false;
	}
	const updateOne = async (value: number) => {
		if (oneSelected == oneAnswer) return;
		let updatedOneGuesses = oneGuesses ?? [];
		updatedOneGuesses.unshift(value);
		oneGuesses = updatedOneGuesses;
		let partial: Partial<ClassProps> = {};
		partial[mathPropsName] = {
			...mathProps,
			oneGuesses: updatedOneGuesses
		};
		let sound = oneSelected == oneAnswer ? 'correct' : 'incorrect';
		updateSound('one-guess', sound);
		popoverOneClose();
		await updateClassDailySlide('attendance', partial);
	};

	// svelte-ignore state_referenced_locally
	let twoGuesses: number[] = $state(mathProps?.twoGuesses ?? []);
	let twoSelected: number | undefined = $derived(twoGuesses[0] ?? undefined);
	let openStateTwo = $state(false);
	function popoverTwoClose() {
		openStateTwo = false;
	}
	const updateTwo = async (value: number) => {
		if (twoSelected == twoAnswer) return;
		let updatedTwoGuesses = twoGuesses ?? [];
		updatedTwoGuesses.unshift(value);
		twoGuesses = updatedTwoGuesses;
		let partial: Partial<ClassProps> = {};
		partial[mathPropsName] = {
			...mathProps,
			twoGuesses: updatedTwoGuesses
		};
		let sound = twoSelected == twoAnswer ? 'correct' : 'incorrect';
		updateSound('two-guess', sound);
		popoverTwoClose();
		await updateClassDailySlide('attendance', partial);
	};

	// svelte-ignore state_referenced_locally
	let resultGuesses: number[] = $state(mathProps?.resultGuesses ?? []);
	let resultSelected: number | undefined = $derived(resultGuesses[0] ?? undefined);
	let openStateResult = $state(false);
	function popoverResultClose() {
		openStateResult = false;
	}
	const updateResult = async (value: number) => {
		if (resultSelected == resultAnswer) return;
		let updatedResultGuesses = resultGuesses ?? [];
		updatedResultGuesses.unshift(value);
		resultGuesses = updatedResultGuesses;
		let partial: Partial<ClassProps> = {};
		partial[mathPropsName] = {
			...mathProps,
			resultGuesses: updatedResultGuesses
		};
		let sound = resultSelected == resultAnswer ? 'correct' : 'incorrect';
		updateSound('result-guess', sound);
		popoverResultClose();
		await updateClassDailySlide('attendance', partial);
	};

	onMount(() => {});

	const baseAnswerClass = `btn text-size-8 font-black border-3 md:border-6 rounded-2xl aspect-square`;
	const undefinedAnswerClass = `preset-filled-surface-300-700 ${baseAnswerClass}`;
	const correctAnswerClass = `preset-filled-success-300-700 ${baseAnswerClass}`;
	const wrongAnswerClass = `preset-filled-error-300-700 ${baseAnswerClass}`;
	// Firefox leaves the text out of an aspect-square button's intrinsic width, so inside the
	// shrink-wrapped popover the options collapsed to slivers (~44px wide) with the numbers
	// spilling out. A length min-width equal to Chrome's natural square (the line height or the
	// digits, whichever is larger, plus the .btn padding of 0.25rem/1rem from app.css and the border) gives both browsers the same grid.
	// The font's digits are 1ch wide; each option button sets --option-digits.
	const optionMinWidthClass =
		'min-w-[calc(max(1lh+0.5rem,var(--option-digits)*1ch+2rem)+6px)] md:min-w-[calc(max(1lh+0.5rem,var(--option-digits)*1ch+2rem)+12px)]';
	// svelte-ignore state_referenced_locally
	const correctAnswers = {
		one: peopleOne.length,
		two: peopleTwo.length,
		result: peopleResult.length
	};
	const isCorrectAnswer = (result: 'one' | 'two' | 'result', num: number) => {
		return correctAnswers[result] === num;
	};
	const getAnswerClass = (answer: 'one' | 'two' | 'result', num?: number) => {
		const answerClass = ' w-[50%]';
		if (num === undefined) return undefinedAnswerClass + answerClass;
		return (isCorrectAnswer(answer, num) ? correctAnswerClass : wrongAnswerClass) + answerClass;
	};
	const wasGuessed = (result: 'one' | 'two' | 'result', num: number) => {
		if (result === 'one') {
			return oneGuesses.includes(num);
		} else if (result === 'two') {
			return twoGuesses.includes(num);
		} else if (result === 'result') {
			return resultGuesses.includes(num);
		}
	};
	const getOptionClass = (result: 'one' | 'two' | 'result', num: number) => {
		if (wasGuessed(result, num)) {
			return isCorrectAnswer(result, num) ? correctAnswerClass : wrongAnswerClass;
		}
		return undefinedAnswerClass;
	};

	const disableGuess = (result: 'one' | 'two' | 'result', num: number) => {
		if (correctAnswers[result] === num) return false;
		const allGuesses = {
			one: oneGuesses,
			two: twoGuesses,
			result: resultGuesses
		};
		const allNums = {
			one: oneSelected,
			two: twoSelected,
			result: resultSelected
		};
		const guesses = allGuesses[result];
		const correctAnswer = correctAnswers[result];
		const currentNum = allNums[result];
		if (correctAnswer === currentNum) {
			return num !== correctAnswer;
		} else {
			return guesses.includes(num);
		}
	};

	// Skeleton 5's Switch ships base-layer styles for a sliding pill (fixed w/h, padding, moving
	// thumb); these utilities override them to keep v3's `compact` look: a round button that
	// is as tall as half the label line, with the thumb filling it and the icon swapped.
	const hintSwitchClass = 'inline-flex h-1/2 items-center gap-4';
	const hintStateClass =
		'preset-filled-surface-200-800 data-[state=checked]:preset-filled-primary-500';
	const hintControlClass = `${hintStateClass} flex aspect-square h-full w-auto cursor-pointer items-center justify-center rounded-full p-0 hover:brightness-90 dark:hover:brightness-110`;
	const hintThumbClass = `${hintStateClass} flex aspect-square h-full transform-none cursor-pointer items-center justify-center rounded-full transition duration-200 ease-in-out`;
	// Skeleton 5's Popover is headless; v3 gave the arrow a 10px size and a surface-200 tip.
	const popoverArrowClass = '[--arrow-size:10px]';
	const popoverArrowTipClass = 'preset-filled-surface-300-700 !bg-surface-200 dark:!bg-surface-800';

	const baseGridDivClass = 'grid';
	const getGridDivClass = (columns: number) => {
		const cols: string = 1 <= columns && columns <= 5 ? columns.toString() : '5';
		const gridColClasses = {
			1: 'grid-cols-1 w-1/5',
			2: 'grid-cols-2 w-2/5',
			3: 'grid-cols-3 w-3/5',
			4: 'grid-cols-4 w-4/5',
			5: 'grid-cols-5 w-full'
		};
		// just making typescript happy
		const colClass =
			gridColClasses[cols as unknown as keyof typeof gridColClasses] || gridColClasses[4];
		return `${baseGridDivClass} ${colClass}`;
	};

	const toggleHint = (result: 'one' | 'two' | 'result') => {
		console.log('toggleHint', result);
		if (result === 'one') {
			showHintOne = !showHintOne;
			console.log('showHintOne', showHintOne);
		} else if (result === 'two') {
			showHintTwo = !showHintTwo;
		} else if (result === 'result') {
			showHintResult = !showHintResult;
		}
		const attendanceProps: Partial<ClassProps> = {};
		attendanceProps[mathPropsName] = {
			...mathProps,
			showHintOne,
			showHintTwo,
			showHintResult
		};
		updateClassDailySlide('attendance', attendanceProps);
	};

	const resetAllGuesses = async () => {
		oneGuesses = [];
		twoGuesses = [];
		resultGuesses = [];
		let partial: Partial<ClassProps> = {};
		partial[mathPropsName] = {
			...mathProps,
			oneGuesses: [],
			twoGuesses: [],
			resultGuesses: []
		};
		await updateClassDailySlide('attendance', partial);
	};

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			if (
				[
					resultSelected === undefined,
					twoSelected === undefined,
					resultSelected === undefined
				].every((e) => e)
			)
				return pageLeft();
			else if (resultSelected === correctAnswers.result) resultSelected = undefined;
			else if (twoSelected === correctAnswers.two) twoSelected = undefined;
			else if (oneSelected === correctAnswers.one) oneSelected = undefined;
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			if (
				[
					resultSelected === correctAnswers.one,
					twoSelected === correctAnswers.two,
					resultSelected === correctAnswers.result
				].every((e) => e)
			)
				return pageRight();
			else if (oneSelected !== correctAnswers.one) oneSelected = correctAnswers.one;
			else if (twoSelected !== correctAnswers.two) twoSelected = correctAnswers.two;
			else if (resultSelected !== correctAnswers.result) resultSelected = correctAnswers.result;
		}
	}
</script>

<ResetSlide onclick={resetAllGuesses} />

<svelte:window on:keydown={onKeydown} />

<div class="h-full w-full">
	<div class="flex h-[20%] w-full items-center justify-center">
		<h1 class="text-size-8 font-black">{title}</h1>
	</div>
	<div class="grid h-[40%] grid-cols-3 items-center justify-center">
		<div class="flex w-full items-center justify-center p-[5%]">
			{#if showHintOne}
				<div class={getGridDivClass(peopleOne.length)}>
					{#each peopleOne as personOne (personOne.id)}
						{#if ['students', 'teachers'].includes(personOne.collectionName)}
							<div class="aspect-square">
								<PersonButton person={personOne} buttonClass="aspect-square p-0" showName={false} />
							</div>
						{:else}
							<GuestButton
								guest={personOne as GuestDaily}
								{guestAvatarMap}
								buttonClass="aspect-square p-0"
								showName={false}
							/>
						{/if}
					{/each}
				</div>
			{:else}
				<div class="flex h-full w-full items-center justify-center">
					<h1 class="text-size-10 font-black">
						{#if oneSelected === correctAnswers.one}
							{oneSelected}
						{:else}
							?
						{/if}
					</h1>
				</div>
			{/if}
		</div>
		<div class="flex w-full items-center justify-center p-[5%]">
			{#if showHintTwo}
				<div class={getGridDivClass(peopleTwo.length)}>
					{#each peopleTwo as personTwo (personTwo.id)}
						{#if ['students', 'teachers'].includes(personTwo.collectionName)}
							<div class="aspect-square">
								<PersonButton person={personTwo} buttonClass="aspect-square p-0" showName={false} />
							</div>
						{:else}
							<GuestButton
								guest={personTwo as GuestDaily}
								{guestAvatarMap}
								buttonClass="aspect-square p-0"
								showName={false}
							/>
						{/if}
					{/each}
				</div>
			{:else}
				<div class="flex h-full w-full items-center justify-center">
					<h1 class="text-size-10 font-black">
						{#if twoSelected === correctAnswers.two}
							{twoSelected}
						{:else}
							?
						{/if}
					</h1>
				</div>
			{/if}
		</div>

		<div class="flex w-full items-center justify-center p-[5%]">
			{#if showHintResult}
				<div class={getGridDivClass(peopleResult.length)}>
					{#each peopleResult as personResult (personResult.id)}
						{#if ['students', 'teachers'].includes(personResult.collectionName)}
							<div class="aspect-square">
								<PersonButton
									person={personResult}
									buttonClass="aspect-square p-0"
									showName={false}
								/>
							</div>
						{:else}
							<GuestButton
								guest={personResult as GuestDaily}
								{guestAvatarMap}
								buttonClass="aspect-square p-0"
								showName={false}
							/>
						{/if}
					{/each}
				</div>
			{:else}
				<div class="flex h-full w-full items-center justify-center">
					<h1 class="text-size-10 font-black">
						{#if resultSelected === correctAnswers.result}
							{resultSelected}
						{:else}
							?
						{/if}
					</h1>
				</div>
			{/if}
		</div>
	</div>
	<div class="relative grid h-[38%] grid-cols-3 items-center justify-center">
		<div class="relative flex h-full flex-col items-center justify-between px-[2%] py-[5%]">
			<h1
				class="text-size-4 hidden w-full items-center justify-center truncate text-nowrap px-[10%] text-center font-semibold sm:flex"
			>
				<Switch
					name="one"
					class={hintSwitchClass}
					checked={showHintOne}
					onCheckedChange={() => {
						toggleHint('one');
					}}
				>
					<Switch.HiddenInput />
					<Switch.Control class={hintControlClass}>
						<Switch.Thumb class={hintThumbClass}>
							<span class="pointer-events-none">
								{#if showHintOne}<GripHorizontal size="20" />{:else}<Hash size="20" />{/if}
							</span>
						</Switch.Thumb>
					</Switch.Control>
				</Switch>
				{oneName}
			</h1>
			<span class={getAnswerClass('one', oneSelected)}>
				<Popover
					open={openStateOne}
					onOpenChange={(e) => (openStateOne = e.open)}
					positioning={{ placement: 'top' }}
				>
					<Popover.Trigger class="btn text-size-8 h-full w-full font-black">
						{oneSelected ?? '?'}
					</Popover.Trigger>
					<Portal>
						<Popover.Positioner>
							<Popover.Content>
								{#snippet element(attributes)}
									{#if !attributes.hidden}
										<div {...attributes} transition:fade={{ duration: 100 }}>
											<Popover.Arrow class={popoverArrowClass}>
												<Popover.ArrowTip class={popoverArrowTipClass} />
											</Popover.Arrow>
											<div class="preset-filled-surface-300-700 max-w-[600px] rounded-2xl p-4">
												<div class="grid grid-cols-2 gap-2 md:gap-4">
													{#each oneOptions as answer (answer)}
														<button
															class="{getOptionClass('one', answer)} {optionMinWidthClass}"
															style:--option-digits={String(answer).length}
															disabled={disableGuess('one', answer)}
															onclick={() => updateOne(answer)}
														>
															{answer}
														</button>
													{/each}
												</div>
											</div>
										</div>
									{/if}
								{/snippet}
							</Popover.Content>
						</Popover.Positioner>
					</Portal>
				</Popover>
			</span>
		</div>
		<div
			class="relative flex h-full flex-col items-center justify-between px-[2%] py-[5%] align-bottom"
		>
			<h1
				class="text-size-4 hidden w-full items-center justify-center truncate text-nowrap px-[10%] text-center font-semibold sm:flex"
			>
				<Switch
					name="one"
					class={hintSwitchClass}
					checked={showHintTwo}
					onCheckedChange={() => {
						toggleHint('two');
					}}
				>
					<Switch.HiddenInput />
					<Switch.Control class={hintControlClass}>
						<Switch.Thumb class={hintThumbClass}>
							<span class="pointer-events-none">
								{#if showHintTwo}<GripHorizontal size="20" />{:else}<Hash size="20" />{/if}
							</span>
						</Switch.Thumb>
					</Switch.Control>
				</Switch>
				{twoName}
			</h1>
			<span class={getAnswerClass('two', twoSelected)}>
				<Popover
					open={openStateTwo}
					onOpenChange={(e) => (openStateTwo = e.open)}
					positioning={{ placement: 'top' }}
				>
					<Popover.Trigger class="btn text-size-8 h-full w-full font-black">
						{twoSelected ?? '?'}
					</Popover.Trigger>
					<Portal>
						<Popover.Positioner>
							<Popover.Content>
								{#snippet element(attributes)}
									{#if !attributes.hidden}
										<div {...attributes} transition:fade={{ duration: 100 }}>
											<Popover.Arrow class={popoverArrowClass}>
												<Popover.ArrowTip class={popoverArrowTipClass} />
											</Popover.Arrow>
											<div class="preset-filled-surface-300-700 max-w-[600px] rounded-2xl p-4">
												<div class="grid grid-cols-2 gap-2 md:gap-4">
													{#each twoOptions as answer (answer)}
														<button
															class="{getOptionClass('two', answer)} {optionMinWidthClass}"
															style:--option-digits={String(answer).length}
															disabled={disableGuess('two', answer)}
															onclick={() => updateTwo(answer)}
														>
															{answer}
														</button>
													{/each}
												</div>
											</div>
										</div>
									{/if}
								{/snippet}
							</Popover.Content>
						</Popover.Positioner>
					</Portal>
				</Popover>
			</span>
		</div>
		<div
			class="relative flex h-full flex-col items-center justify-between px-[2%] py-[5%] align-bottom"
		>
			<h1
				class="text-size-4 hidden w-full items-center justify-center truncate text-nowrap px-[10%] text-center font-semibold sm:flex"
			>
				<Switch
					name="one"
					class={hintSwitchClass}
					checked={showHintResult}
					onCheckedChange={() => {
						toggleHint('result');
					}}
				>
					<Switch.HiddenInput />
					<Switch.Control class={hintControlClass}>
						<Switch.Thumb class={hintThumbClass}>
							<span class="pointer-events-none">
								{#if showHintResult}<GripHorizontal size="20" />{:else}<Hash size="20" />{/if}
							</span>
						</Switch.Thumb>
					</Switch.Control>
				</Switch>
				{resultName}
			</h1>

			<span class={getAnswerClass('result', resultSelected)}>
				<Popover
					open={openStateResult}
					onOpenChange={(e) => (openStateResult = e.open)}
					positioning={{ placement: 'top' }}
				>
					<Popover.Trigger class="btn text-size-8 h-full w-full font-black">
						{resultSelected ?? '?'}
					</Popover.Trigger>
					<Portal>
						<Popover.Positioner>
							<Popover.Content>
								{#snippet element(attributes)}
									{#if !attributes.hidden}
										<div {...attributes} transition:fade={{ duration: 100 }}>
											<Popover.Arrow class={popoverArrowClass}>
												<Popover.ArrowTip class={popoverArrowTipClass} />
											</Popover.Arrow>
											<div class="preset-filled-surface-300-700 max-w-[600px] rounded-2xl p-4">
												<div class="grid grid-cols-2 gap-2 md:gap-4">
													{#each resultOptions as answer (answer)}
														<button
															class="{getOptionClass('result', answer)} {optionMinWidthClass}"
															style:--option-digits={String(answer).length}
															disabled={disableGuess('result', answer)}
															onclick={() => updateResult(answer)}
														>
															{answer}
														</button>
													{/each}
												</div>
											</div>
										</div>
									{/if}
								{/snippet}
							</Popover.Content>
						</Popover.Positioner>
					</Portal>
				</Popover>
			</span>
		</div>

		<h2
			class="-translate-1/2 text-size-8 absolute left-1/3 top-[60%] transform items-center text-center font-black"
		>
			+
		</h2>
		<h2
			class="-translate-1/2 text-size-8 absolute left-2/3 top-[60%] transform items-center text-center font-black"
		>
			=
		</h2>
	</div>
</div>
