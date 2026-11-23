<!--
	@component
	The days of the class's own observance, in the Add / Edit form: the list, and adding a day by
	its kind: on a date (the date picker: one day, every year (moved off a weekend if asked), or
	several days in a row, weekends skipped if asked), a weekday of a month, counted from Easter, a
	date in another calendar, or an Advanced date-holidays rule. A quick pick fills one in. Rules
	(also ones written in the PocketBase dashboard) can be changed with Edit; one that isn't changed
	is saved back exactly as it was. Duplicates are never added. See dates.ts and rules.ts.

	A day picked or set up but not added yet is not in `entries`: the form asks `pendingPick()`
	(through bind:this) before saving or closing, so it isn't silently left out.
-->
<script lang="ts">
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import CalendarRange from '@lucide/svelte/icons/calendar-range';
	import Check from '@lucide/svelte/icons/check';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Pencil from '@lucide/svelte/icons/pencil';
	import X from '@lucide/svelte/icons/x';
	import { tick } from 'svelte';
	import { plural } from '#lib/editor/list.ts';
	import {
		addEntries,
		covers,
		dayDate,
		dayProblem,
		describeEntry,
		entryCheck,
		expandRange,
		formatDay,
		isDayString,
		keyOf,
		MAX_YEAR,
		MIN_YEAR,
		nextYearly,
		ruleEntry,
		savedValue,
		setYearly,
		sortEntries,
		startOfDay,
		yearlyEntry,
		type DayEntry
	} from './dates.ts';
	import {
		CALENDAR_IDS,
		CALENDARS,
		dayThirtyNote,
		describeRule,
		EASTER_NAME,
		MAX_EASTER_DAYS,
		MONTHS,
		NTHS,
		nthText,
		parseRule,
		QUICK_PICKS,
		RULE_YEARS,
		ruleText,
		SPEC_URL,
		tidyRule,
		WEEKDAYS,
		WEEKEND_MOVES,
		type CalendarId,
		type EasterKind,
		type Nth,
		type RuleSpec,
		type WeekendMove
	} from './rules.ts';

	interface Props {
		entries: DayEntry[];
		onChange: (entries: DayEntry[]) => void;
		today: Date;
		disabled?: boolean;
		/** The form's message for the days (e.g. "Please add at least one day."). */
		error?: string;
		/** A quick pick was chosen: its name, for an observance that has none yet. */
		onPickName?: (name: string) => void;
	}

	let { entries, onChange, today, disabled = false, error, onPickName }: Props = $props();

	const idPrefix = $props.id();
	const id = (part: string) => `${idPrefix}-${part}`;
	const MIN = `${MIN_YEAR}-01-01`;
	const MAX = `${MAX_YEAR}-12-31`;

	/** The kinds of day "Add a day" builds. */
	type Kind = 'date' | 'weekday' | 'easter' | 'calendar' | 'advanced';
	const KINDS: { value: Kind; label: string; help: string }[] = [
		{
			value: 'date',
			label: 'On a date',
			help: 'One day, several days in a row, or every year on the same date.'
		},
		{
			value: 'weekday',
			label: 'A weekday of a month',
			help: 'Every year, e.g. the 3rd Monday in January, or the Friday after the 4th Thursday in November.'
		},
		{
			value: 'easter',
			label: 'Counted from Easter',
			help: 'Every year, e.g. 2 days before Easter Sunday (Good Friday).'
		},
		{
			value: 'calendar',
			label: 'Another calendar',
			help: 'Every year on a date of the Hebrew, Islamic, Chinese or Persian calendar.'
		},
		{
			value: 'advanced',
			label: 'Advanced',
			help: 'Type a rule for date-holidays, the holiday library the calendar uses.'
		}
	];
	const CALENDAR_HINTS: Record<CalendarId, string> = {
		hebrew:
			'Hebrew days begin at sundown the evening before; the calendar shows the day itself. A leap year has two months of Adar: “Adar” is then Adar I, and “Adar II” the second one (Purim is on 14 Adar II). In other years both are the one Adar.',
		islamic:
			'Islamic days begin at sundown the evening before; the calendar shows the day itself. The dates are calculated, so they can differ by a day from when they are announced.',
		chinese:
			'Lunar New Year is day 1 of the 1st month; the Mid-Autumn Festival is day 15 of the 8th.',
		persian: 'Nowruz (the Persian New Year) is 1 Farvardin.'
	};

	let kind: Kind = $state('date');

	// On a date
	let day = $state('');
	let dayYearly = $state(false);
	let weekend: WeekendMove = $state('keep');
	let from = $state('');
	let to = $state('');
	let skipWeekends = $state(true);
	let rangeYearly = $state(false);
	// A weekday of a month
	let nth: Nth = $state(1);
	let weekday = $state(1);
	let month = $state(1);
	let thenDirection: '' | 'before' | 'after' = $state('');
	let thenWeekday = $state(5);
	// Counted from Easter
	let easter: EasterKind = $state('easter');
	let easterWhen: 'on' | 'before' | 'after' = $state('on');
	let easterDays = $state(2);
	// Another calendar
	let calendar: CalendarId = $state('hebrew');
	let calendarMonth = $state(CALENDARS.hebrew.months[0].rule);
	let calendarDay = $state(1);
	// Advanced
	let advanced = $state('');

	/** The day being built (not "On a date") was set up here, or filled by a quick pick. */
	let touched = $state(false);
	/** The entry being changed with Edit: its key (to find it again), its saved text and words. */
	let editing: { key: string; text: string; words: string } | null = $state(null);

	/** What the last action did (read out to screen readers). */
	let message = $state('');
	/** Why the last "Add" didn't work. */
	let problem = $state('');
	let dayInput: HTMLInputElement | undefined = $state();
	let fromInput: HTMLInputElement | undefined = $state();
	let list: HTMLUListElement | undefined = $state();
	let builder: HTMLElement | undefined = $state();

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

	/** The entry for a picked 'YYYY-MM-DD' (a yearly one shows its next date, or is a rule). */
	function picked(pickedDay: string, yearly: boolean, move: WeekendMove = 'keep'): DayEntry {
		if (!yearly) return { kind: 'once', day: pickedDay };
		if (move === 'keep') return yearlyEntry(pickedDay, today);
		const [, pickedMonth, date] = pickedDay.split('-').map(Number);
		return {
			kind: 'rule',
			rule: ruleText({ kind: 'date', month: pickedMonth, day: date, weekend: move })
		};
	}

	function addDay() {
		if (disabled) return;
		const issue = dayProblem(day, dayYearly);
		if (issue) {
			problem = issue;
			message = '';
			dayInput?.focus();
			return;
		}
		const entry = picked(day, dayYearly, weekend);
		if (editing) {
			if (applyEdit(entry)) resetDay();
		} else if (add([entry], describeEntry(entry))) resetDay();
		dayInput?.focus();
	}

	function resetDay() {
		day = '';
		dayYearly = false;
		weekend = 'keep';
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

	// --- The other kinds: a rule built from the choices (or typed) ------------------------------

	/** The rule the choices make; null when they don't make one. */
	const builtSpec = $derived.by((): RuleSpec | null => {
		if (kind === 'weekday')
			return {
				kind: 'weekday',
				nth,
				weekday,
				month,
				...(thenDirection && thenWeekday !== weekday
					? { then: { direction: thenDirection, weekday: thenWeekday } }
					: {})
			};
		if (kind === 'easter') {
			if (easterWhen === 'on') return { kind: 'easter', easter, offset: 0 };
			if (!Number.isInteger(easterDays) || easterDays < 1 || easterDays > MAX_EASTER_DAYS)
				return null;
			return { kind: 'easter', easter, offset: easterWhen === 'before' ? -easterDays : easterDays };
		}
		if (kind === 'calendar')
			return { kind: 'calendar', calendar, month: calendarMonth, day: calendarDay };
		return null;
	});
	/** The entry the choices (or the typed rule) make, or why there is none. */
	const built = $derived.by((): { entry: DayEntry } | { error: string } | null => {
		if (kind === 'date') return null;
		if (kind === 'advanced') return ruleEntry(advanced, today);
		if (!builtSpec) return { error: `Please choose from 1 to ${MAX_EASTER_DAYS} days.` };
		return ruleEntry(ruleText(builtSpec), today);
	});
	const builtEntry = $derived(built && 'entry' in built ? built.entry : null);
	/** The next days of what is built: up to 3. */
	const builtNext = $derived.by((): string[] => {
		if (!builtEntry) return [];
		if (builtEntry.kind === 'rule') return entryCheck(builtEntry, today)?.days.slice(0, 3) ?? [];
		return builtEntry.kind === 'once' || builtEntry.kind === 'yearly' ? [builtEntry.day] : [];
	});

	function addRule() {
		if (disabled) return;
		// Unchanged (also an entry that isn't text, which date-holidays can't read): kept as it is.
		if (editing && kind === 'advanced' && sameText(advanced, editing.text)) {
			doneBuilding('No change.');
			return;
		}
		if (!built || 'error' in built) {
			problem = built?.error ?? '';
			message = '';
			focusBuilder();
			return;
		}
		const entry = built.entry;
		if (editing) applyEdit(entry);
		else if (add([entry], describeEntry(entry))) doneBuilding(message);
	}

	/**
	 * The day built is in the list (or an Edit is over): what the choices show isn't waiting to be
	 * added any more. The rule box is emptied, and so is the date an Edit filled in.
	 */
	function clearBuilder() {
		if (editing && kind === 'date') resetDay();
		editing = null;
		touched = false;
		if (kind === 'advanced') advanced = '';
	}

	function doneBuilding(words: string) {
		clearBuilder();
		problem = '';
		message = words;
	}

	/** Two rules that are written the same (spaces, or a weekday's first letter, aside). */
	function sameText(a: string, b: string): boolean {
		if (tidyRule(a) === tidyRule(b)) return true;
		const [specA, specB] = [parseRule(tidyRule(a)), parseRule(tidyRule(b))];
		return !!specA && !!specB && ruleText(specA) === ruleText(specB);
	}

	/** Fills the choices with a rule the editor builds. */
	function fill(spec: RuleSpec) {
		if (spec.kind === 'date') {
			kind = 'date';
			day = nextYearly(
				`${String(spec.month).padStart(2, '0')}-${String(spec.day).padStart(2, '0')}`,
				today
			);
			dayYearly = true;
			weekend = spec.weekend;
		} else if (spec.kind === 'weekday') {
			kind = 'weekday';
			nth = spec.nth;
			weekday = spec.weekday;
			month = spec.month;
			thenDirection = spec.then?.direction ?? '';
			thenWeekday = spec.then?.weekday ?? (spec.weekday + 1) % 7;
		} else if (spec.kind === 'easter') {
			kind = 'easter';
			easter = spec.easter;
			easterWhen = spec.offset === 0 ? 'on' : spec.offset < 0 ? 'before' : 'after';
			if (spec.offset) easterDays = Math.abs(spec.offset);
		} else {
			kind = 'calendar';
			calendar = spec.calendar;
			calendarMonth = spec.month;
			calendarDay = spec.day;
		}
	}

	function quickPick(rule: string) {
		const pick = QUICK_PICKS.find((p) => p.rule === rule);
		const spec = pick && parseRule(pick.rule);
		if (!pick || !spec) return;
		fill(spec);
		touched = true;
		problem = '';
		onPickName?.(pick.name);
		message = `Filled in ${pick.label}: ${describeRule(spec)}. Check it, then press ${editing ? 'Save change' : 'Add day'}.`;
	}

	// --- Edit -------------------------------------------------------------------------------

	async function focusBuilder() {
		await tick();
		builder?.querySelector<HTMLElement>('[data-days-first]')?.focus();
	}

	/** Puts a rule (or an entry written in the dashboard) into the choices, to change it. */
	function edit(entry: DayEntry) {
		// Another day's change that wasn't saved is dropped (that day stays as it was).
		clearBuilder();
		const text = entry.kind === 'rule' ? entry.rule : entry.kind === 'other' ? entry.text : '';
		const spec = entry.kind === 'rule' ? parseRule(entry.rule) : null;
		if (spec) fill(spec);
		else {
			kind = 'advanced';
			advanced = text;
		}
		touched = false;
		editing = { key: keyOf(entry), text, words: describeEntry(entry) };
		problem = '';
		message = `Changing ${editing.words}: make your changes, then press Save change.`;
		builder?.scrollIntoView({ block: 'nearest' });
		focusBuilder();
	}

	function cancelEdit() {
		doneBuilding(editing ? `${editing.words} is left as it was.` : '');
	}

	/** Replaces the entry being changed with `entry`; false when it can't be. */
	function applyEdit(entry: DayEntry): boolean {
		if (!editing) return false;
		const key = editing.key;
		const index = entries.findIndex((existing) => keyOf(existing) === key);
		if (index === -1) {
			// Removed meanwhile: it is a new day.
			editing = null;
			if (!add([entry], describeEntry(entry))) return false;
			doneBuilding(message);
			return true;
		}
		const old = entries[index];
		if (keyOf(old) === keyOf(entry) || sameText(savedValue(entry), editing.text)) {
			doneBuilding('No change.');
			return true;
		}
		const rest = entries.filter((_, at) => at !== index);
		if (rest.some((existing) => covers(existing, entry))) {
			problem = `${describeEntry(entry)} is already in the list.`;
			message = '';
			return false;
		}
		let next: DayEntry[];
		if (entry.kind === 'rule') {
			// In its place among the rules.
			next = [...entries];
			next[index] = entry;
			next = sortEntries(next);
		} else next = addEntries(rest, [entry]).entries;
		onChange(next);
		doneBuilding(`Changed ${editing.words} to ${describeEntry(entry)}.`);
		return true;
	}

	// --- Picked but not added ------------------------------------------------------------------

	/** Whether the list already has all of these days. */
	const listed = (adding: DayEntry[]) =>
		adding.every((entry) => entries.some((existing) => covers(existing, entry)));
	/** A day is picked in "Add a day" that isn't in the list. */
	const dayPending = $derived(
		kind === 'date' &&
			!!day &&
			(!!dayProblem(day, dayYearly) || !listed([picked(day, dayYearly, weekend)]))
	);
	/** Days in a row are (partly) picked that aren't all in the list. */
	const rangePending = $derived(
		kind === 'date' &&
			!editing &&
			!!(from || to) &&
			!(range && 'days' in range && listed(range.days.map((d) => picked(d, rangeYearly))))
	);
	/** A day built with the other kinds that isn't in the list (or a change not saved). */
	const rulePending = $derived.by(() => {
		if (kind === 'date') return false;
		if (editing) {
			const text = kind === 'advanced' ? advanced : builtEntry ? savedValue(builtEntry) : '';
			return !sameText(text, editing.text);
		}
		if (kind === 'advanced' ? !advanced.trim() : !touched) return false;
		return !builtEntry || !listed([builtEntry]);
	});
	const rangeLabel = $derived(
		range && 'days' in range ? `Add ${plural(range.days.length, 'day')}` : 'Add days'
	);
	const dayWords = (text: string) => (isDayString(text) ? formatDay(dayDate(text)) : text);

	/**
	 * What was picked but not added yet, in words for the form ('' when nothing): saving now would
	 * leave it out, and closing would throw it away.
	 */
	export function pendingPick(): string {
		if (editing && (dayPending || rulePending))
			return `You changed ${editing.words} but didn't save the change: press Save change, or Cancel.`;
		const parts: string[] = [];
		if (dayPending) parts.push(`You picked ${dayWords(day)} but didn't add it: press Add day.`);
		if (rangePending)
			parts.push(
				from && to
					? `You picked the days from ${dayWords(from)} to ${dayWords(to)} but didn't add them: press ${rangeLabel}.`
					: `You picked ${from ? `a first day (${dayWords(from)})` : `a last day (${dayWords(to)})`} for several days in a row but didn't add them: pick both days and press Add days, or clear it.`
			);
		if (rulePending)
			parts.push(
				builtEntry
					? `You set up “${describeEntry(builtEntry)}” but didn't add it: press Add day.`
					: kind === 'advanced'
						? `You typed a rule but didn't add it: press Add day, or clear the box.`
						: `You set up a day but didn't add it: press Add day.`
			);
		return parts.join(' ');
	}

	// --- The list ------------------------------------------------------------------------------

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
			entry.kind !== 'once' && entry.kind !== 'yearly'
				? ''
				: yearly
					? `${formatDay(dayDate(entry.day))} now repeats every year.`
					: `${formatDay(dayDate(entry.day))} is now that year only.`;
		onChange(result.entries);
	}

	async function removeAt(index: number) {
		const entry = entries[index];
		// Removing the day being changed ends the change.
		if (editing && editing.key === keyOf(entry)) clearBuilder();
		onChange(entries.filter((_, at) => at !== index));
		problem = '';
		message = `Removed ${describeEntry(entry)}.`;
		// Keep the keyboard where it was: the next day's Remove button, else the date picker.
		await tick();
		const buttons = list?.querySelectorAll<HTMLButtonElement>('[data-remove-day]') ?? [];
		(
			buttons[Math.min(index, buttons.length - 1)] ??
			builder?.querySelector<HTMLElement>('[data-days-first]')
		)?.focus();
	}

	/** A rule as it is written (not one the editor describes in words). */
	const written = (entry: DayEntry) =>
		entry.kind === 'other' || (entry.kind === 'rule' && !parseRule(entry.rule));

	/** Enter in a date picker or the rule box adds the day(s) instead of saving the form. */
	const onEnter = (action: () => void) => (event: KeyboardEvent) => {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		action();
	};

	function chooseKind(value: Kind) {
		kind = value;
		problem = '';
	}

	function chooseCalendar(value: CalendarId) {
		calendar = value;
		calendarMonth = CALENDARS[value].months[0].rule;
		calendarDay = Math.min(calendarDay, CALENDARS[value].months[0].days);
		touched = true;
	}

	const calendarMonths = $derived(CALENDARS[calendar].months);
	const monthDays = $derived(calendarMonths.find((m) => m.rule === calendarMonth)?.days ?? 30);
	/** Weekdays for "then": not the day's own weekday ("after" would give the day itself). */
	const thenWeekdays = $derived(
		WEEKDAYS.map((name, index) => ({ name, index })).filter((w) => w.index !== weekday)
	);
	const quickGroups = $derived(
		[...new Set(QUICK_PICKS.map((pick) => pick.group))].map(
			(group) => [group, QUICK_PICKS.filter((pick) => pick.group === group)] as const
		)
	);
	const help = $derived(KINDS.find((item) => item.value === kind)?.help ?? '');

	const inputClass = 'input px-3 py-2 text-base';
	// Room on the right for the select's arrow.
	const selectClass = 'select py-2 ps-3 pe-10 text-base';
</script>

{#snippet preview()}
	<div class="text-sm" aria-live="polite" data-rule-preview>
		{#if built && 'error' in built}
			{#if kind === 'advanced' && !advanced.trim()}
				<p class="opacity-80">Type a rule to check it.</p>
			{:else}
				<p class="text-error-700-300 font-semibold" data-rule-problem>{built.error}</p>
			{/if}
		{:else if builtEntry}
			<p class="font-semibold" data-rule-words>{describeEntry(builtEntry)}</p>
			<p class="opacity-80" data-rule-next>
				{builtEntry.kind === 'once' ? 'That day: ' : 'Next: '}{builtNext
					.map((d) => formatDay(dayDate(d)))
					.join(' · ')}
			</p>
		{/if}
	</div>
{/snippet}

{#snippet ruleButtons()}
	<div class="flex flex-wrap gap-2">
		<button
			type="button"
			class="btn preset-tonal-primary px-3 py-2"
			{disabled}
			onclick={addRule}
			data-add-rule
			data-pending={rulePending ? '' : undefined}
		>
			{#if editing}
				<Check class="size-5" aria-hidden="true" />
				Save change
			{:else}
				<CalendarPlus class="size-5" aria-hidden="true" />
				Add day
			{/if}
		</button>
		{#if editing}
			<button type="button" class="btn preset-tonal px-3 py-2" {disabled} onclick={cancelEdit}>
				Cancel
			</button>
		{/if}
	</div>
{/snippet}

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
				{@const check = entryCheck(entry, today)}
				<li
					class="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5 {editing?.key === keyOf(entry)
						? 'bg-primary-500/10 rounded-base -mx-2 px-2'
						: ''}"
					data-day
					data-editing={editing?.key === keyOf(entry) ? '' : undefined}
				>
					<span class="min-w-40 flex-1">
						<span
							class="font-semibold {isPast(entry) ? 'opacity-60' : ''} {written(entry)
								? 'font-mono text-sm break-all'
								: ''}"
						>
							{text}
						</span>
						{#if isPast(entry)}
							<span class="text-sm opacity-70">(passed)</span>
						{:else if entry.kind === 'yearly'}
							<span class="text-sm opacity-70">(next: {formatDay(dayDate(entry.day))})</span>
						{:else if check?.days.length}
							<span class="text-sm opacity-70" data-day-next>
								(next: {formatDay(dayDate(check.days[0]))})
							</span>
						{:else if check?.readable}
							<span class="text-sm opacity-70">(not in the next {RULE_YEARS} years)</span>
						{/if}
						<!-- An Advanced rule saved here is read back like one written in the dashboard. -->
						{#if written(entry)}
							<span class="block text-sm opacity-80" data-day-note>
								{#if !check?.readable}
									The calendar can't read this (it was saved outside this editor), so it doesn't
									show it. Kept as it is: change it with Edit, or remove it.
								{:else if check.long}
									Several days in a row (a date-holidays rule): the calendar shows only the first
									day. Kept as written.
								{:else}
									A date-holidays rule (Advanced), kept as written.
								{/if}
							</span>
						{/if}
					</span>
					{#if entry.kind === 'once' || entry.kind === 'yearly'}
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
					{:else}
						<button
							type="button"
							class="btn preset-tonal px-3 py-1.5 text-sm"
							data-edit-day
							{disabled}
							onclick={() => edit(entry)}
						>
							<Pencil class="size-4" aria-hidden="true" />
							Edit<span class="sr-only">{` ${text}`}</span>
						</button>
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

	<div class="space-y-3" bind:this={builder} data-day-builder>
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<label class="text-sm font-semibold" for={id('quick')}>Quick pick</label>
			<select
				id={id('quick')}
				class="{selectClass} w-64 max-w-full"
				value=""
				{disabled}
				aria-describedby={id('quick-hint')}
				data-quick-pick
				onchange={(event) => {
					quickPick(event.currentTarget.value);
					event.currentTarget.value = '';
				}}
			>
				<option value="">Choose a common day…</option>
				{#each quickGroups as [group, picks] (group)}
					<optgroup label={group}>
						{#each picks as pick (pick.rule)}
							<option value={pick.rule}>{pick.label}</option>
						{/each}
					</optgroup>
				{/each}
			</select>
			<span id={id('quick-hint')} class="text-sm opacity-80">
				Fills in the day below, and the name if it's empty.
			</span>
		</div>
		<div class="space-y-1">
			<p id={id('kind')} class="text-sm font-semibold">
				{editing ? `Changing ${editing.words}: kind of day` : 'Kind of day'}
			</p>
			<div
				role="radiogroup"
				aria-labelledby={id('kind')}
				aria-describedby={id('kind-help')}
				class="flex flex-wrap gap-2"
				data-day-kinds
			>
				{#each KINDS as item (item.value)}
					<label
						class="rounded-base border-surface-300-700 has-checked:border-primary-500 has-checked:preset-tonal-primary has-focus-visible:ring-primary-500 flex cursor-pointer items-center gap-2 border px-3 py-1.5 text-sm has-focus-visible:ring-2"
					>
						<input
							type="radio"
							class="radio"
							name={id('kind-choice')}
							value={item.value}
							checked={kind === item.value}
							{disabled}
							onchange={() => chooseKind(item.value)}
						/>
						{item.label}
					</label>
				{/each}
			</div>
			<p id={id('kind-help')} class="text-sm opacity-80">{help}</p>
		</div>

		{#if kind === 'date'}
			<div class="grid gap-3 lg:grid-cols-2">
				<div
					class="preset-tonal rounded-base space-y-2 p-3"
					role="group"
					aria-labelledby={id('one')}
				>
					<p id={id('one')} class="text-sm font-semibold">
						{editing ? 'Change it to a day' : 'Add a day'}
					</p>
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
								data-days-first
								onkeydown={onEnter(addDay)}
								oninput={() => (problem = '')}
							/>
						</label>
						<label class="flex items-center gap-2 py-2 text-sm">
							<input type="checkbox" class="checkbox" bind:checked={dayYearly} {disabled} />
							Every year
						</label>
					</div>
					{#if dayYearly}
						<label class="block text-sm">
							<span class="block">If it falls on a weekend</span>
							<select class="{selectClass} w-full" bind:value={weekend} {disabled} data-weekend>
								{#each WEEKEND_MOVES as move (move.value)}
									<option value={move.value}>{move.label}</option>
								{/each}
							</select>
						</label>
					{/if}
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							class="btn preset-tonal-primary px-3 py-2"
							{disabled}
							onclick={addDay}
							data-add-day
							data-pending={dayPending ? '' : undefined}
						>
							{#if editing}
								<Check class="size-5" aria-hidden="true" />
								Save change
							{:else}
								<CalendarPlus class="size-5" aria-hidden="true" />
								Add day
							{/if}
						</button>
						{#if editing}
							<button
								type="button"
								class="btn preset-tonal px-3 py-2"
								{disabled}
								onclick={cancelEdit}
							>
								Cancel
							</button>
						{/if}
					</div>
				</div>

				{#if !editing}
					<div
						class="preset-tonal rounded-base space-y-2 p-3"
						role="group"
						aria-labelledby={id('range')}
					>
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
								data-pending={rangePending ? '' : undefined}
							>
								<CalendarRange class="size-5" aria-hidden="true" />
								{rangeLabel}
							</button>
						</div>
					</div>
				{/if}
			</div>
		{:else}
			<div
				class="preset-tonal rounded-base space-y-3 p-3"
				role="group"
				aria-labelledby={id('kind')}
				data-rule-builder={kind}
			>
				{#if kind === 'weekday'}
					<div class="flex flex-wrap items-end gap-x-3 gap-y-2">
						<span class="py-2 text-sm">Every year on the</span>
						<label class="text-sm">
							<span class="block">Which</span>
							<select
								class={selectClass}
								bind:value={nth}
								{disabled}
								data-days-first
								onchange={() => (touched = true)}
							>
								{#each NTHS as choice (choice)}
									<option value={choice}>{nthText(choice)}</option>
								{/each}
							</select>
						</label>
						<label class="text-sm">
							<span class="block">Weekday</span>
							<select
								class={selectClass}
								value={weekday}
								{disabled}
								onchange={(event) => {
									weekday = Number(event.currentTarget.value);
									if (thenWeekday === weekday) thenWeekday = (weekday + 1) % 7;
									touched = true;
								}}
							>
								{#each WEEKDAYS as name, index (name)}
									<option value={index}>{name}</option>
								{/each}
							</select>
						</label>
						<span class="py-2 text-sm">in</span>
						<label class="text-sm">
							<span class="block">Month</span>
							<select
								class={selectClass}
								bind:value={month}
								{disabled}
								onchange={() => (touched = true)}
							>
								{#each MONTHS as name, index (name)}
									<option value={index + 1}>{name}</option>
								{/each}
							</select>
						</label>
					</div>
					<div class="flex flex-wrap items-end gap-x-3 gap-y-2">
						<label class="text-sm">
							<span class="block">Or a day near it</span>
							<select
								class={selectClass}
								bind:value={thenDirection}
								{disabled}
								onchange={() => (touched = true)}
							>
								<option value="">No: that day itself</option>
								<option value="before">A weekday before it</option>
								<option value="after">A weekday after it</option>
							</select>
						</label>
						{#if thenDirection}
							<label class="text-sm">
								<span class="block">Which weekday</span>
								<select
									class={selectClass}
									bind:value={thenWeekday}
									{disabled}
									onchange={() => (touched = true)}
								>
									{#each thenWeekdays as choice (choice.index)}
										<option value={choice.index}>The {choice.name} {thenDirection} it</option>
									{/each}
								</select>
							</label>
						{/if}
					</div>
					<p class="text-sm opacity-80">
						A 5th weekday isn't in every month: for the last one, choose “last”.
					</p>
				{:else if kind === 'easter'}
					<div class="flex flex-wrap items-end gap-x-3 gap-y-2">
						<span class="py-2 text-sm">Every year</span>
						<label class="text-sm">
							<span class="block">When</span>
							<select
								class={selectClass}
								bind:value={easterWhen}
								{disabled}
								data-days-first
								onchange={() => (touched = true)}
							>
								<option value="on">On the day itself</option>
								<option value="before">Days before</option>
								<option value="after">Days after</option>
							</select>
						</label>
						{#if easterWhen !== 'on'}
							<label class="text-sm">
								<span class="block">Days</span>
								<input
									type="number"
									class="{inputClass} w-24"
									min="1"
									max={MAX_EASTER_DAYS}
									step="1"
									value={easterDays}
									{disabled}
									onkeydown={onEnter(addRule)}
									oninput={(event) => {
										easterDays = event.currentTarget.valueAsNumber;
										touched = true;
										problem = '';
									}}
								/>
							</label>
						{/if}
						<label class="text-sm">
							<span class="block">{easterWhen === 'on' ? 'Of' : 'Counted from'}</span>
							<select
								class={selectClass}
								bind:value={easter}
								{disabled}
								onchange={() => (touched = true)}
							>
								{#each Object.entries(EASTER_NAME) as [value, name] (value)}
									<option {value}>{name}</option>
								{/each}
							</select>
						</label>
					</div>
					<p class="text-sm opacity-80">
						Easter Sunday itself is already on the calendar (a built-in holiday). Orthodox Easter is
						usually a week or more later.
					</p>
				{:else if kind === 'calendar'}
					<div class="flex flex-wrap items-end gap-x-3 gap-y-2">
						<label class="text-sm">
							<span class="block">Calendar</span>
							<select
								class={selectClass}
								value={calendar}
								{disabled}
								data-days-first
								onchange={(event) => chooseCalendar(event.currentTarget.value as CalendarId)}
							>
								{#each CALENDAR_IDS as value (value)}
									<option {value}>{CALENDARS[value].label}</option>
								{/each}
							</select>
						</label>
						<label class="text-sm">
							<span class="block">Day</span>
							<select
								class={selectClass}
								bind:value={calendarDay}
								{disabled}
								onchange={() => (touched = true)}
							>
								{#each Array.from({ length: monthDays }, (_, i) => i + 1) as value (value)}
									<option {value}>{value}</option>
								{/each}
							</select>
						</label>
						<label class="text-sm">
							<span class="block">Month</span>
							<select
								class={selectClass}
								value={calendarMonth}
								{disabled}
								onchange={(event) => {
									calendarMonth = event.currentTarget.value;
									const days = calendarMonths.find((m) => m.rule === calendarMonth)?.days ?? 30;
									calendarDay = Math.min(calendarDay, days);
									touched = true;
								}}
							>
								{#each calendarMonths as choice (choice.rule)}
									<option value={choice.rule}>{choice.label}</option>
								{/each}
							</select>
						</label>
					</div>
					<p class="text-sm opacity-80" data-calendar-hint>
						{CALENDAR_HINTS[calendar]}
						{dayThirtyNote(calendar, calendarMonth, calendarDay)}
					</p>
				{:else}
					<label class="block text-sm">
						<span class="block">Rule</span>
						<input
							type="text"
							class="{inputClass} w-full font-mono"
							autocomplete="off"
							spellcheck="false"
							placeholder="e.g. Monday before 06-01"
							bind:value={advanced}
							{disabled}
							data-days-first
							data-advanced
							onkeydown={onEnter(addRule)}
							oninput={() => (problem = '')}
						/>
					</label>
					<p class="text-sm opacity-80">
						As date-holidays writes it, e.g. <code>Monday before 06-01</code> (the last Monday in
						May), <code>03-02 in even years</code> or <code>11-20 since 2027</code>. Several days in
						a row are a range (On a date).
						<!-- eslint-disable svelte/no-navigation-without-resolve -- the library's own page -->
						<a
							href={SPEC_URL}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-1 font-semibold underline"
						>
							The rules it understands<ExternalLink class="size-3.5" aria-hidden="true" />
							<span class="sr-only">(opens a new tab)</span>
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</p>
				{/if}
				{@render preview()}
				{@render ruleButtons()}
			</div>
		{/if}
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
