<!--
	@component
	The days of the class's own observance, in the Add / Edit form: the list (each one-time or
	every year), "Add a day" with the date picker, and "Add several days" (a range, expanded to
	single days, weekends skipped if asked). Duplicates are never added. See dates.ts.
-->
<script lang="ts">
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import CalendarRange from '@lucide/svelte/icons/calendar-range';
	import X from '@lucide/svelte/icons/x';
	import { tick } from 'svelte';
	import { plural } from '#lib/editor/list.ts';
	import {
		addEntries,
		dayDate,
		dayProblem,
		describeEntry,
		expandRange,
		formatDay,
		MAX_YEAR,
		MIN_YEAR,
		setYearly,
		startOfDay,
		yearlyEntry,
		type DayEntry
	} from './dates.ts';

	interface Props {
		entries: DayEntry[];
		onChange: (entries: DayEntry[]) => void;
		today: Date;
		disabled?: boolean;
		/** The form's message for the days (e.g. "Please add at least one day."). */
		error?: string;
	}

	let { entries, onChange, today, disabled = false, error }: Props = $props();

	const idPrefix = $props.id();
	const id = (part: string) => `${idPrefix}-${part}`;
	const MIN = `${MIN_YEAR}-01-01`;
	const MAX = `${MAX_YEAR}-12-31`;

	let day = $state('');
	let dayYearly = $state(false);
	let from = $state('');
	let to = $state('');
	let skipWeekends = $state(true);
	let rangeYearly = $state(false);
	/** What the last action did (read out to screen readers). */
	let message = $state('');
	/** Why the last "Add" didn't work. */
	let problem = $state('');
	let dayInput: HTMLInputElement | undefined = $state();
	let fromInput: HTMLInputElement | undefined = $state();
	let list: HTMLUListElement | undefined = $state();

	const isPast = (entry: DayEntry) =>
		entry.kind === 'once' && dayDate(entry.day) < startOfDay(today);

	/** The words for days that were already there: "Wed, Nov 25, 2026 is already in the list." */
	function alreadyText(already: DayEntry[]): string {
		if (already.length === 0) return '';
		if (already.length === 1) return `${describeEntry(already[0])} is already in the list.`;
		return `${plural(already.length, 'day')} were already in the list.`;
	}

	function add(adding: DayEntry[], what: string, extra = ''): boolean {
		const result = addEntries(entries, adding);
		const already = alreadyText(result.alreadyThere);
		const replaced = result.replaced.length
			? ` ${plural(result.replaced.length, 'one-time day')} on that date ${result.replaced.length === 1 ? 'is' : 'are'} now covered by it.`
			: '';
		if (result.added === 0) {
			problem = already;
			message = '';
			return false;
		}
		onChange(result.entries);
		problem = '';
		message = `Added ${what}${extra}.${replaced}${already ? ` ${already}` : ''}`;
		return true;
	}

	/** The entry for a picked 'YYYY-MM-DD' (a yearly one shows its next date). */
	const picked = (pickedDay: string, yearly: boolean): DayEntry =>
		yearly ? yearlyEntry(pickedDay, today) : { kind: 'once', day: pickedDay };

	function addDay() {
		if (disabled) return;
		const issue = dayProblem(day, dayYearly);
		if (issue) {
			problem = issue;
			message = '';
			dayInput?.focus();
			return;
		}
		const entry = picked(day, dayYearly);
		if (add([entry], describeEntry(entry))) {
			day = '';
			dayYearly = false;
		}
		dayInput?.focus();
	}

	const range = $derived(
		from && to ? expandRange(from, to, { skipWeekends, yearly: rangeYearly }) : null
	);

	function addRange() {
		if (disabled) return;
		const result = expandRange(from, to, { skipWeekends, yearly: rangeYearly });
		if ('error' in result) {
			problem = result.error;
			message = '';
			fromInput?.focus();
			return;
		}
		const skipped = result.skippedWeekends
			? ` (${plural(result.skippedWeekends, 'weekend day')} left out)`
			: '';
		if (
			add(
				result.days.map((d) => picked(d, rangeYearly)),
				plural(result.days.length, 'day'),
				skipped
			)
		) {
			from = '';
			to = '';
			rangeYearly = false;
		}
		fromInput?.focus();
	}

	function toggleYearly(index: number, yearly: boolean) {
		const result = setYearly(entries, index, yearly, today);
		if ('error' in result) {
			problem = result.error;
			message = '';
			return;
		}
		problem = '';
		const entry = entries[index];
		message =
			entry.kind === 'other'
				? ''
				: yearly
					? `${formatDay(dayDate(entry.day))} now repeats every year.`
					: `${formatDay(dayDate(entry.day))} is now that year only.`;
		onChange(result.entries);
	}

	async function removeAt(index: number) {
		const entry = entries[index];
		onChange(entries.filter((_, at) => at !== index));
		problem = '';
		message = `Removed ${describeEntry(entry)}.`;
		// Keep the keyboard where it was: the next day's Remove button, else the date picker.
		await tick();
		const buttons = list?.querySelectorAll<HTMLButtonElement>('[data-remove-day]') ?? [];
		(buttons[Math.min(index, buttons.length - 1)] ?? dayInput)?.focus();
	}

	/** Enter in a date picker adds the day(s) instead of saving the form. */
	const onEnter = (action: () => void) => (event: KeyboardEvent) => {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		action();
	};

	const inputClass = 'input px-3 py-2 text-base';
</script>

<fieldset
	class="border-surface-200-800 rounded-container space-y-3 border px-4 pt-2 pb-3"
	aria-describedby={error ? id('error') : undefined}
	data-days
>
	<legend class="label-text px-1">Days <span class="text-error-600-400">*</span></legend>

	{#if entries.length > 0}
		<ul bind:this={list} class="divide-surface-200-800 divide-y" aria-label="Days">
			<!-- By position: a day saved twice in the dashboard must not break the list. -->
			{#each entries as entry, index (index)}
				{@const text = describeEntry(entry)}
				<li class="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5" data-day>
					<span class="min-w-40 flex-1">
						<span class="font-semibold {isPast(entry) ? 'opacity-60' : ''}">{text}</span>
						{#if isPast(entry)}
							<span class="text-sm opacity-70">(passed)</span>
						{:else if entry.kind === 'yearly'}
							<span class="text-sm opacity-70">(next: {formatDay(dayDate(entry.day))})</span>
						{:else if entry.kind === 'other'}
							<span class="block text-sm opacity-80">
								Saved outside this editor in a form it doesn't read; kept as it is.
							</span>
						{/if}
					</span>
					{#if entry.kind !== 'other'}
						<label class="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								class="checkbox"
								checked={entry.kind === 'yearly'}
								{disabled}
								onchange={(event) => toggleYearly(index, event.currentTarget.checked)}
							/>
							Every year<span class="sr-only">{` (${text})`}</span>
						</label>
					{/if}
					<button
						type="button"
						class="btn-icon btn-icon-sm hover:preset-tonal-error"
						aria-label="Remove {text}"
						title="Remove"
						data-remove-day
						{disabled}
						onclick={() => removeAt(index)}
					>
						<X class="size-5" aria-hidden="true" />
					</button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm opacity-80">No days yet: add one below.</p>
	{/if}

	<div class="grid gap-3 lg:grid-cols-2">
		<div class="preset-tonal rounded-base space-y-2 p-3" role="group" aria-labelledby={id('one')}>
			<p id={id('one')} class="text-sm font-semibold">Add a day</p>
			<div class="flex flex-wrap items-end gap-x-3 gap-y-2">
				<label class="text-sm">
					<span class="block">Day</span>
					<input
						bind:this={dayInput}
						id={id('day')}
						type="date"
						class="{inputClass} w-44 max-w-full"
						min={MIN}
						max={MAX}
						bind:value={day}
						{disabled}
						onkeydown={onEnter(addDay)}
						oninput={() => (problem = '')}
					/>
				</label>
				<label class="flex items-center gap-2 py-2 text-sm">
					<input type="checkbox" class="checkbox" bind:checked={dayYearly} {disabled} />
					Every year
				</label>
				<button
					type="button"
					class="btn preset-tonal-primary px-3 py-2"
					{disabled}
					onclick={addDay}
					data-add-day
				>
					<CalendarPlus class="size-5" aria-hidden="true" />
					Add day
				</button>
			</div>
		</div>

		<div class="preset-tonal rounded-base space-y-2 p-3" role="group" aria-labelledby={id('range')}>
			<p id={id('range')} class="text-sm font-semibold">Add several days in a row</p>
			<div class="flex flex-wrap items-end gap-x-3 gap-y-2">
				<label class="text-sm">
					<span class="block">From</span>
					<input
						bind:this={fromInput}
						type="date"
						class="{inputClass} w-44 max-w-full"
						min={MIN}
						max={MAX}
						bind:value={from}
						{disabled}
						onkeydown={onEnter(addRange)}
						oninput={() => (problem = '')}
					/>
				</label>
				<label class="text-sm">
					<span class="block">To</span>
					<input
						type="date"
						class="{inputClass} w-44 max-w-full"
						min={from || MIN}
						max={MAX}
						bind:value={to}
						{disabled}
						onkeydown={onEnter(addRange)}
						oninput={() => (problem = '')}
					/>
				</label>
			</div>
			<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
				<label class="flex items-center gap-2 text-sm">
					<input type="checkbox" class="checkbox" bind:checked={skipWeekends} {disabled} />
					Skip weekends
				</label>
				<label class="flex items-center gap-2 text-sm">
					<input type="checkbox" class="checkbox" bind:checked={rangeYearly} {disabled} />
					Every year
				</label>
				<button
					type="button"
					class="btn preset-tonal-primary px-3 py-2"
					{disabled}
					onclick={addRange}
					data-add-range
				>
					<CalendarRange class="size-5" aria-hidden="true" />
					{range && 'days' in range ? `Add ${plural(range.days.length, 'day')}` : 'Add days'}
				</button>
			</div>
		</div>
	</div>

	<p class="text-sm" aria-live="polite">
		{#if problem}
			<span class="text-error-700-300 font-semibold" data-days-problem>{problem}</span>
		{:else if message}
			<span data-days-message>{message}</span>
		{/if}
	</p>
	{#if error}
		<p id={id('error')} class="text-error-700-300 text-sm font-semibold">{error}</p>
	{/if}
</fieldset>
