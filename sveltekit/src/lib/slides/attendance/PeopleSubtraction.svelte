<script lang="ts">
	import { onMount } from 'svelte';
	import type { Student, Teacher } from '#lib/pb/types.ts';
	import PersonButton from '#lib/buttons/PersonButton.svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { fade } from 'svelte/transition';

	import Cross from '@lucide/svelte/icons/x';
	import type { ClassProps, MathClassProps } from './_types';
	import { on } from 'svelte/events';
	import { updateSound } from '#lib/sounds.ts';
	import ResetSlide from '#lib/slides/ResetSlide.svelte';

	interface PeopleMathProps {
		from?: 'left' | 'right';
		peopleTogetherName?: string;
		peopleSubtracted: Student[] | Teacher[];
		peopleSubtractedName?: string;
		peopleRemaining: Student[] | Teacher[];
		peopleRemainingName?: string;
		mathProps?: MathClassProps;
		mathPropsName: 'studentMath' | 'peopleMath';
		title?: string;
		subtitle?: string;
		pageLeft?: () => void;
		pageRight?: () => void;
		updateClassDailySlide: (
			column: string,
			partialClassDaily: Partial<ClassProps>
		) => Promise<void>;
	}

	let {
		peopleTogetherName,
		peopleSubtracted,
		peopleSubtractedName,
		peopleRemaining,
		peopleRemainingName,
		mathProps,
		mathPropsName,
		title,
		subtitle,
		pageLeft = () => {},
		pageRight = () => {},
		updateClassDailySlide = async (column: string, partialClassDaily: Partial<ClassProps>) => {}
	}: PeopleMathProps = $props();

	// svelte-ignore state_referenced_locally
	let peopleTogether: (Student | Teacher)[] = [...peopleSubtracted, ...peopleRemaining].sort(
		(a, b) => a.name.localeCompare(b.name)
	);

	const optionsPerQuestion: number = 4;

	let oneAnswer = $derived(peopleTogether.length);
	// svelte-ignore state_referenced_locally
	let oneOptDist = $state(mathProps?.oneOptDist ?? 0);
	let oneAnsIndex = $derived(Math.round(oneOptDist * (optionsPerQuestion - 1)));
	let oneStart = $derived(oneAnswer - oneAnsIndex > 0 ? oneAnswer - oneAnsIndex : 0);
	let oneOptions: number[] = $derived(
		Array.from({ length: optionsPerQuestion }, (_, i) => oneStart + i)
	);

	let twoAnswer = $derived(peopleSubtracted.length);
	// svelte-ignore state_referenced_locally
	let twoOptDist = $state(mathProps?.twoOptDist ?? 0);
	let twoAnsIndex = $derived(Math.round(twoOptDist * (optionsPerQuestion - 1)));
	let twoStart = $derived(twoAnswer - twoAnsIndex > 0 ? twoAnswer - twoAnsIndex : 0);
	let twoOptions: number[] = $derived(
		Array.from({ length: optionsPerQuestion }, (_, i) => twoStart + i)
	);

	let resultAnswer = $derived(peopleRemaining.length);
	// svelte-ignore state_referenced_locally
	let resultOptDist = $state(mathProps?.resultOptDist ?? 0);
	let resultAnsIndex = $derived(Math.round(resultOptDist * (optionsPerQuestion - 1)));
	let resultStart = $derived(resultAnswer - resultAnsIndex > 0 ? resultAnswer - resultAnsIndex : 0);
	let resultOptions: number[] = $derived(
		Array.from({ length: optionsPerQuestion }, (_, i) => resultStart + i)
	);

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

	const baseAnswerClass =
		'btn text-size-8 font-black border-3 md:border-6 rounded-2xl aspect-square';
	// Skeleton 3 gave every popover arrow --arrow-size: 10px and a surface-200/800 tip.
	const arrowClass =
		'[--arrow-size:10px] [--arrow-background:var(--color-surface-200)] dark:[--arrow-background:var(--color-surface-800)]';
	const undefinedAnswerClass = `preset-filled-surface-300-700 ${baseAnswerClass}`;
	const correctAnswerClass = `preset-filled-success-300-700 ${baseAnswerClass}`;
	const wrongAnswerClass = `preset-filled-error-300-700 ${baseAnswerClass}`;
	const correctAnswers = () => {
		return {
			one: oneAnswer,
			two: twoAnswer,
			result: resultAnswer
		};
	};
	const isCorrectAnswer = (result: 'one' | 'two' | 'result', num: number) => {
		return correctAnswers()[result] === num;
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
	// Firefox works out the popover's width as if these square (aspect-square) grid items were only
	// as wide as their padding and border, so the options collapse into thin strips. Give them the
	// width Chromium computes as a minimum: the larger of one line + the .btn block padding (0.5rem)
	// and the number (ABeeZee digits are 1ch wide, --digits set per button) + the .btn inline
	// padding (2rem), plus the border (border-3 md:border-6). .btn padding: see app.css.
	const optionSizeClass =
		'min-w-[calc(max(1lh_+_0.5rem,var(--digits)_*_1ch_+_2rem)_+_6px)] md:min-w-[calc(max(1lh_+_0.5rem,var(--digits)_*_1ch_+_2rem)_+_12px)]';
	const getOptionClass = (result: 'one' | 'two' | 'result', num: number) => {
		if (wasGuessed(result, num)) {
			return `${isCorrectAnswer(result, num) ? correctAnswerClass : wrongAnswerClass} ${optionSizeClass}`;
		}
		return `${undefinedAnswerClass} ${optionSizeClass}`;
	};

	const disableGuess = (result: 'one' | 'two' | 'result', num: number) => {
		let answers = correctAnswers();
		if (answers[result] === num) return false;
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
		const correctAnswer = answers[result];
		const currentNum = allNums[result];
		if (correctAnswer === currentNum) {
			return num !== correctAnswer;
		} else {
			return guesses.includes(num);
		}
	};

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
		const colClass =
			// just making typescript happy
			gridColClasses[cols as unknown as keyof typeof gridColClasses] || gridColClasses[4];
		return `${baseGridDivClass} ${colClass}`;
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
		let answers = correctAnswers();
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
			else if (resultSelected === answers.result) resultSelected = undefined;
			else if (twoSelected === answers.two) twoSelected = undefined;
			else if (oneSelected === answers.one) oneSelected = undefined;
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			if (
				[
					resultSelected === answers.one,
					twoSelected === answers.two,
					resultSelected === answers.result
				].every((e) => e)
			)
				return pageRight();
			else if (oneSelected !== answers.one) oneSelected = answers.one;
			else if (twoSelected !== answers.two) twoSelected = answers.two;
			else if (resultSelected !== answers.result) resultSelected = answers.result;
		}
	}

	let clickedPeopleIds: string[] = $state([]);
	const personClicked = (id: string) => {
		const newClickedPeopleIds = clickedPeopleIds.filter((clickedId) => clickedId !== id);
		if (newClickedPeopleIds.length === clickedPeopleIds.length) {
			clickedPeopleIds = [...clickedPeopleIds, id];
		} else {
			clickedPeopleIds = newClickedPeopleIds;
		}
	};
</script>

<ResetSlide onclick={resetAllGuesses} />

<svelte:window on:keydown={onKeydown} />

<div class="h-full w-full">
	<div class="flex h-[20%] w-full cursor-default items-center justify-center">
		<!-- sm:text-nowrap: Firefox's synthetic bold (ABeeZee has no 900 face) makes the title ~6px
		     wider than the 3xl slide, so it wrapped and the first line was cut off. -->
		<h1 class="text-size-8 font-black sm:text-nowrap">{title}</h1>
	</div>
	<div class="flex h-[40%] items-center justify-center">
		<div class="flex w-1/2 items-center justify-center p-[5%]">
			<div class={getGridDivClass(peopleTogether.length)}>
				{#each peopleTogether as person (person.id)}
					<div class="relative aspect-square">
						{#if clickedPeopleIds.includes(person.id)}
							<Cross
								class="z-1 pointer-events-none absolute left-1/2 top-1/2 h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2"
							/>
						{/if}
						<PersonButton
							{person}
							buttonClass="w-full h-full m-0 p-0"
							showName={false}
							onClick={() => {
								personClicked(person.id);
							}}
						/>
					</div>
				{/each}
			</div>
		</div>
	</div>
	<div class="relative grid h-[38%] grid-cols-3 items-center justify-center">
		<div class="relative flex h-full flex-col items-center justify-between px-[2%] py-[5%]">
			<h1
				class="text-size-4 hidden w-full items-center justify-center truncate text-nowrap px-[10%] text-center font-semibold sm:flex"
			>
				{peopleTogetherName}
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
						<Popover.Positioner class="z-10!">
							<Popover.Content>
								{#snippet element(attributes)}
									{#if !attributes.hidden}
										<div {...attributes} transition:fade={{ duration: 100 }}>
											<Popover.Arrow class={arrowClass}>
												<Popover.ArrowTip />
											</Popover.Arrow>
											<div class="preset-filled-surface-300-700 max-w-[600px] rounded-2xl p-4">
												<div class="grid grid-cols-2 gap-2 md:gap-4">
													{#each oneOptions as answer (answer)}
														<button
															class={getOptionClass('one', answer)}
															style:--digits={String(answer).length}
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
				{peopleSubtractedName}
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
						<Popover.Positioner class="z-10!">
							<Popover.Content>
								{#snippet element(attributes)}
									{#if !attributes.hidden}
										<div {...attributes} transition:fade={{ duration: 100 }}>
											<Popover.Arrow class={arrowClass}>
												<Popover.ArrowTip />
											</Popover.Arrow>
											<div class="preset-filled-surface-300-700 max-w-[600px] rounded-2xl p-4">
												<div class="grid grid-cols-2 gap-2 md:gap-4">
													{#each twoOptions as answer (answer)}
														<button
															class={getOptionClass('two', answer)}
															style:--digits={String(answer).length}
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
				{peopleRemainingName}
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
						<Popover.Positioner class="z-10!">
							<Popover.Content>
								{#snippet element(attributes)}
									{#if !attributes.hidden}
										<div {...attributes} transition:fade={{ duration: 100 }}>
											<Popover.Arrow class={arrowClass}>
												<Popover.ArrowTip />
											</Popover.Arrow>
											<div class="preset-filled-surface-300-700 max-w-[600px] rounded-2xl p-4">
												<div class="grid grid-cols-2 gap-2 md:gap-4">
													{#each resultOptions as answer (answer)}
														<button
															class={getOptionClass('result', answer)}
															style:--digits={String(answer).length}
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
			-
		</h2>
		<h2
			class="-translate-1/2 text-size-8 absolute left-2/3 top-[60%] transform items-center text-center font-black"
		>
			=
		</h2>
	</div>
</div>
