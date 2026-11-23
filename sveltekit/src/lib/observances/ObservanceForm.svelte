<!--
	@component
	The Add / Edit observance form: change a built-in holiday (its picture, school day, notes, or
	hiding it), or add the class's own day(s). Same protections as the People form: one save at a
	time, Escape asks before throwing changes away, only changed fields are sent (nothing when
	nothing changed), and a save gives up after 30 s.
-->
<script lang="ts">
	import { Dialog, SegmentedControl } from '@skeletonlabs/skeleton-svelte';
	import Pencil from '@lucide/svelte/icons/pencil';
	import { tick, untrack } from 'svelte';
	import { describeError, validationCodes } from '#lib/editor/errors.ts';
	import { changedFields, hasErrors, type SaveOutcome } from '#lib/editor/form.ts';
	import LabeledSwitch from '#lib/editor/LabeledSwitch.svelte';
	import { SMALL_PICTURE_SIDE } from '#lib/editor/picture.ts';
	import PicturePicker from '#lib/editor/PicturePicker.svelte';
	import {
		builtInDays,
		findBuiltIn,
		holidaySettings,
		isSettingsRecord,
		type BuiltInHoliday,
		type School
	} from '#lib/pb/calendar.ts';
	import {
		createObservance,
		iconPictureUrl,
		listSettingsRecords,
		observanceImageUrl,
		updateObservance
	} from '#lib/pb/observances.ts';
	import type { FileChange } from '#lib/pb/requests.ts';
	import type { CalendarObservance, IconRecord } from '#lib/pb/types.ts';
	import { dayDate, formatDay, startOfDay, type DayEntry } from './dates.ts';
	import DayCellPreview from './DayCellPreview.svelte';
	import DaysEditor from './DaysEditor.svelte';
	import {
		builtInOf,
		emptyForm,
		fieldsFromForm,
		formFieldOf,
		formFromRecord,
		imageChange,
		sameForm,
		savedFields,
		validateForm,
		type FormErrors,
		type FormField,
		MAX_DISPLAY_NAME,
		type FormPreset,
		type Kind,
		type ObservanceFormValues,
		type PictureChoice
	} from './form.ts';
	import IconChoice from './IconChoice.svelte';
	import { OBSERVANCE_ERRORS, SCHOOL_LABEL, settingsRecordsFor } from './observances.ts';

	interface Props {
		/** The record to edit, or null to add one. */
		record: CalendarObservance | null;
		preset?: FormPreset;
		/** Every observance (live): to find the changes a built-in holiday already has. */
		records: readonly CalendarObservance[];
		icons: readonly IconRecord[];
		iconsStatus: 'loading' | 'ready' | 'error';
		holidays: readonly BuiltInHoliday[];
		today: Date;
		onSaved: (record: CalendarObservance, outcome: SaveOutcome) => void;
		onCancel: () => void;
		/** Open the existing changes to a built-in holiday instead (the editor makes one per holiday). */
		onEditOther: (record: CalendarObservance) => void;
	}

	let {
		record,
		preset = {},
		records,
		icons,
		iconsStatus,
		holidays,
		today,
		onSaved,
		onCancel,
		onEditOther
	}: Props = $props();

	// The form works on its own copy, taken when the dialog opens: a live update to this record
	// from another window never overwrites what is being typed here.
	const original = untrack(() => record);
	const initial: ObservanceFormValues = untrack(() =>
		original ? formFromRecord(original, holidays, today) : emptyForm(preset, holidays)
	);
	let values: ObservanceFormValues = $state({ ...initial, entries: [...initial.entries] });
	let errors: FormErrors = $state({});
	let message = $state('');
	/** A save is on its way, or done (the dialog is then closing): the form takes no more input. */
	let saving = $state(false);
	/** The save request is on its way (the button says so; not while the dialog closes). */
	let sending = $state(false);
	/** The school day was chosen by hand: choosing another holiday doesn't change it. */
	let schoolTouched = untrack(() => !!original);
	/** Found in PocketBase just before saving: the chosen holiday already has changes. */
	let takenFresh: CalendarObservance | undefined = $state.raw();

	/**
	 * The kind can be chosen when adding (but not from a holiday's Customize), and for a record the
	 * calendar ignores (no days, and no holiday by its name).
	 */
	const chooseKind = untrack(() =>
		original ? isSettingsRecord(original) && !builtInOf(original, holidays) : !preset.holiday
	);

	const clearError = (field: FormField) => {
		if (errors[field]) errors[field] = undefined;
		if (message && !hasErrors(errors)) message = '';
	};

	// --- Built-in holiday ----------------------------------------------------------------------

	const builtIn = $derived(
		values.kind === 'builtin' && values.holiday ? findBuiltIn(holidays, values.holiday) : undefined
	);
	/** Another record that already changes the chosen holiday. */
	const takenBy = $derived(
		builtIn
			? (settingsRecordsFor(records, builtIn.name).find((other) => other.id !== original?.id) ??
					(takenFresh && takenFresh.name === builtIn.name ? takenFresh : undefined))
			: undefined
	);

	/** The holiday's next day (its own, not observed), today included. */
	function nextDayOf(name: string): Date | null {
		const start = startOfDay(today);
		for (let year = start.getFullYear(); year < start.getFullYear() + 8; year++) {
			const day = builtInDays(year).find((d) => d.holiday === name && !d.observed);
			if (day && day.dateObj >= start) return day.dateObj;
		}
		return null;
	}
	/** Every holiday with its next day, soonest first: the choices of the holiday picker. */
	const holidayChoices = $derived(
		holidays
			.map((holiday) => ({ holiday, next: nextDayOf(holiday.name) }))
			.sort((a, b) => (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity))
	);
	/** Holidays that already have changes saved (other than this record). */
	const changed = $derived(
		new Set(
			records
				.filter((other) => other.id !== original?.id && isSettingsRecord(other))
				.map((other) => findBuiltIn(holidays, other.name ?? '')?.name)
				.filter(Boolean)
		)
	);
	/** The other name a holiday already shows under (from changes other than this record). */
	const otherSettings = $derived(
		holidaySettings(records.filter((other) => other.id !== original?.id))
	);
	const observedDay = $derived.by(() => {
		if (!builtIn) return null;
		const start = startOfDay(today);
		for (const year of [start.getFullYear(), start.getFullYear() + 1]) {
			const day = builtInDays(year).find((d) => d.holiday === builtIn.name && d.observed);
			if (day && day.dateObj >= start) return day.dateObj;
		}
		return null;
	});

	function chooseHoliday(name: string) {
		values.holiday = name;
		takenFresh = undefined;
		const holiday = findBuiltIn(holidays, name);
		if (holiday && !schoolTouched) values.school = holiday.school;
		clearError('holiday');
	}

	function chooseKindValue(kind: Kind) {
		values.kind = kind;
		if (kind === 'builtin' && builtIn && !schoolTouched) values.school = builtIn.school;
		if (kind === 'custom' && !schoolTouched) values.school = 'full';
		clearError('holiday');
		clearError('name');
		clearError('entries');
	}

	// --- Picture -------------------------------------------------------------------------------

	const savedImageUrl = original?.image ? observanceImageUrl(original) : '';
	/** What to send for its own picture in "Upload" (see PicturePicker). */
	let picture: FileChange = $state();
	let preparingPicture = $state(false);
	const chosenIcon = $derived(icons.find((icon) => icon.id === values.icon));
	const iconUrl = $derived(chosenIcon ? iconPictureUrl(chosenIcon) : '');

	function choosePicture(choice: PictureChoice) {
		values.picture = choice;
		clearError('icon');
		clearError('image');
	}

	// --- Preview -------------------------------------------------------------------------------

	const shownName = $derived(
		values.kind === 'builtin'
			? values.displayName.trim() || builtIn?.name || '(holiday)'
			: values.name.trim() || '(name)'
	);
	const previewDay = $derived.by(() => {
		if (values.kind === 'builtin') return (builtIn && nextDayOf(builtIn.name)) || today;
		const start = startOfDay(today);
		const days = values.entries
			.flatMap((entry) => (entry.kind === 'other' ? [] : [dayDate(entry.day)]))
			.sort((a, b) => a.getTime() - b.getTime());
		return days.find((day) => day >= start) ?? days[days.length - 1] ?? today;
	});
	const pictureWords = $derived(
		values.picture === 'upload'
			? 'its own picture'
			: values.picture === 'icon'
				? chosenIcon
					? chosenIcon.image
						? `the picture of the icon “${chosenIcon.name}”`
						: `the default picture (“${chosenIcon.name}” has no picture yet)`
					: 'the icon you choose'
				: 'the default calendar picture'
	);

	// --- Save ----------------------------------------------------------------------------------

	const title = untrack(() => {
		if (!original) return null;
		const holiday = builtInOf(original, holidays);
		return holiday ? `Change ${holiday.name}` : `Edit ${original.name?.trim() || 'observance'}`;
	});
	const shownTitle = $derived(
		title ?? (values.kind === 'builtin' ? 'Change a built-in holiday' : 'Add your own day')
	);
	const idPrefix = $props.id();
	const id = (field: string) => `${idPrefix}-${field}`;

	/** Where each message's field takes the keyboard (in the form's order). */
	const errorFocus: [FormField, () => string[]][] = [
		['holiday', () => [`[id="${id('holiday')}"]`]],
		['displayName', () => [`[id="${id('display-name')}"]`]],
		['name', () => [`[id="${id('name')}"]`]],
		['entries', () => ['[data-days] [data-pending]', '[data-days] input[type="date"]']],
		['school', () => ['[data-school] [data-state="checked"] input', '[data-school] input']],
		['icon', () => ['[data-icon-choice] input:checked', '[data-icon-choice] input']],
		['image', () => ['[data-upload] button:not(:disabled)']]
	];
	async function focusFirstError() {
		await tick();
		const form = document.querySelector('[data-observance-form]');
		for (const [field, selectors] of errorFocus) {
			if (!errors[field]) continue;
			for (const selector of selectors()) {
				const element = form?.querySelector<HTMLElement>(selector);
				if (element) return element.focus();
			}
		}
	}

	const hasUpload = () => picture instanceof File || (!!original?.image && picture === undefined);

	let daysEditor: ReturnType<typeof DaysEditor> | undefined = $state();
	/** A day picked in the days list but not added yet ('' when none; see DaysEditor). */
	const pendingDays = () => (values.kind === 'custom' ? (daysEditor?.pendingPick() ?? '') : '');

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (saving || preparingPicture) return;
		const problems = validateForm(values, {
			holidays,
			takenBy,
			hasUpload: hasUpload(),
			pendingDays: pendingDays()
		});
		// A message about a picture that couldn't be used stays while "Upload" is chosen.
		errors = {
			...problems,
			image: problems.image ?? (values.picture === 'upload' ? errors.image : undefined)
		};
		if (hasErrors(problems)) {
			message = 'Please fix the highlighted fields.';
			focusFirstError();
			return;
		}

		const fields = fieldsFromForm(values, holidays);
		const image = imageChange(values.picture, picture, !!original?.image);
		// What the record holds now: only what changed is sent (see savedFields).
		const before = original ? savedFields(original, initial, values, holidays) : null;
		const changes = before ? changedFields(before, fields) : fields;
		// Once saved, the form stays locked while the dialog closes: a second Enter in that moment
		// must not save (or add the record) again.
		saving = true;
		message = '';
		if (original && Object.keys(changes).length === 0 && image === undefined) {
			// Nothing to send: no request, no live update for every open calendar.
			onSaved(original, 'unchanged');
			return;
		}
		sending = true;
		const doing = original
			? `save ${original.name?.trim() || 'the observance'}`
			: `add ${fields.name || 'the observance'}`;
		try {
			// One set of changes per built-in holiday: check PocketBase itself (another window may
			// have just added one) before making a record one.
			const becomesSettings =
				values.kind === 'builtin' &&
				(!before || before.name !== fields.name || before.dates.length > 0);
			if (becomesSettings) {
				const fresh = await listSettingsRecords();
				const other = settingsRecordsFor(fresh, fields.name).find((r) => r.id !== original?.id);
				if (other) {
					takenFresh = other;
					errors = {
						holiday: `You've already changed ${fields.name}. Edit those changes instead.`
					};
					message = 'Please fix the highlighted fields.';
					sending = false;
					saving = false;
					focusFirstError();
					return;
				}
			}
			const saved = original
				? await updateObservance(original.id, changes, image)
				: await createObservance(fields, image instanceof File ? image : undefined);
			sending = false;
			onSaved(saved, original ? 'saved' : 'created');
		} catch (error) {
			sending = false;
			saving = false;
			if (validationCodes(error).icon === 'validation_missing_rel_records') {
				errors = { icon: 'That icon was just deleted (on the Icons page). Please choose another.' };
				message = 'Please fix the highlighted fields.';
				focusFirstError();
				return;
			}
			const problem = describeError(error, doing, {
				...OBSERVANCE_ERRORS,
				fieldOf: formFieldOf(values.kind)
			});
			errors = problem.fields;
			message = problem.message;
			if (Object.keys(problem.fields).length > 0) focusFirstError();
		}
	}

	/** For Escape: the dialog stays open while saving, and asks before changes are thrown away. */
	export function canClose(): boolean {
		if (saving) return false;
		if (picture === undefined && !preparingPicture && sameForm(values, initial) && !pendingDays())
			return true;
		return confirm('Discard your changes?');
	}

	const schoolItems: { value: School; label: string }[] = [
		{ value: 'none', label: SCHOOL_LABEL.none },
		{ value: 'short', label: SCHOOL_LABEL.short },
		{ value: 'full', label: SCHOOL_LABEL.full }
	];
	const kindItems: { value: Kind; label: string; help: string }[] = [
		{
			value: 'custom',
			label: 'Add your own day(s)',
			help: 'A Minimum Day, a field trip, Picture Day, a class birthday…'
		},
		{
			value: 'builtin',
			label: 'Change a built-in holiday',
			help: 'Its name, picture or school day, or hide it (e.g. Tax Day).'
		}
	];
	const pictureItems = $derived<{ value: PictureChoice; label: string }[]>([
		{ value: 'default', label: "The calendar's default picture" },
		{ value: 'icon', label: 'An icon from the Icons page' },
		{
			value: 'upload',
			label:
				values.kind === 'builtin'
					? 'A picture just for this holiday'
					: 'A picture just for this day'
		}
	]);
	const inputClass = 'input placeholder:text-surface-400-600 px-3 py-2 text-base';
</script>

{#snippet fieldError(field: FormField)}
	{#if errors[field]}
		<p id={id(`${field}-error`)} class="text-error-700-300 text-sm font-semibold">
			{errors[field]}
		</p>
	{/if}
{/snippet}

<form class="flex min-h-0 flex-1 flex-col" novalidate onsubmit={save} data-observance-form>
	<header class="border-surface-200-800 shrink-0 border-b px-6 py-3">
		<Dialog.Title class="h4 truncate">{shownTitle}</Dialog.Title>
	</header>

	<div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-3">
		{#if chooseKind}
			<div role="radiogroup" aria-label="What to do" class="grid gap-2 sm:grid-cols-2">
				{#each kindItems as item (item.value)}
					<label
						class="rounded-container border-surface-200-800 has-checked:border-primary-500 has-checked:preset-tonal-primary has-focus-visible:ring-primary-500 flex cursor-pointer items-start gap-3 border-2 p-3 has-focus-visible:ring-2"
					>
						<input
							type="radio"
							class="radio mt-0.5 shrink-0"
							name={id('kind')}
							value={item.value}
							checked={values.kind === item.value}
							disabled={saving}
							onchange={() => chooseKindValue(item.value)}
						/>
						<span>
							<span class="block font-semibold">{item.label}</span>
							<span class="block text-sm opacity-80">{item.help}</span>
						</span>
					</label>
				{/each}
			</div>
		{/if}

		{#if values.kind === 'builtin'}
			<div class="space-y-1">
				{#if original && !chooseKind}
					<!-- Its changes stay with this holiday: no picker. -->
					<p class="text-lg font-semibold">{builtIn?.name ?? values.holiday}</p>
				{:else}
					<label class="label" for={id('holiday')}>
						<span class="label-text">Holiday <span class="text-error-600-400">*</span></span>
						<select
							id={id('holiday')}
							class="select px-3 py-2 text-base"
							data-initial-focus
							value={values.holiday}
							disabled={saving}
							onchange={(event) => chooseHoliday(event.currentTarget.value)}
							aria-invalid={!!errors.holiday}
							aria-describedby="{id('holiday-hint')}{errors.holiday
								? ` ${id('holiday-error')}`
								: ''}"
						>
							<option value="" disabled>Choose a holiday…</option>
							<!-- The holiday's own name first: it is what is chosen here, and typing it finds it. -->
							{#each holidayChoices as choice (choice.holiday.name)}
								{@const shownAs = otherSettings.get(choice.holiday.name)?.displayName}
								<option value={choice.holiday.name}>
									{choice.holiday.name}{choice.next
										? ` (${formatDay(choice.next)})`
										: ''}{changed.has(choice.holiday.name) ? ', already changed' : ''}{shownAs
										? `: shown as “${shownAs}”`
										: ''}
								</option>
							{/each}
						</select>
					</label>
				{/if}
				<p id={id('holiday-hint')} class="text-sm opacity-80">
					{#if builtIn}
						{@const next = nextDayOf(builtIn.name)}
						{next ? `Next: ${formatDay(next)}` : 'Not in the next few years'}{observedDay
							? `; on a weekend, so it is observed on ${formatDay(observedDay)} (the calendar marks both)`
							: ''}. Its own school day: {SCHOOL_LABEL[builtIn.school]}.
					{:else}
						Holidays the calendar shows by itself (US holidays).
					{/if}
				</p>
				{@render fieldError('holiday')}
				{#if takenBy}
					<button
						type="button"
						class="btn preset-tonal-primary px-3 py-2"
						disabled={saving}
						onclick={() => {
							// Only the holiday was chosen here; ask before anything else typed is lost.
							const other = takenBy;
							const { kind, holiday, school } = initial;
							const onlyPicked =
								picture === undefined && sameForm({ ...values, kind, holiday, school }, initial);
							if (other && (onlyPicked || confirm('Discard your changes?'))) onEditOther(other);
						}}
					>
						<Pencil class="size-5" aria-hidden="true" />
						Edit the changes to {builtIn?.name}
					</button>
				{/if}
			</div>

			<div class="space-y-1">
				<label class="label" for={id('display-name')}>
					<span class="label-text">Name on the calendar</span>
					<input
						id={id('display-name')}
						class={inputClass}
						autocomplete="off"
						maxlength={MAX_DISPLAY_NAME}
						placeholder={builtIn?.name ?? ''}
						value={values.displayName}
						disabled={saving}
						oninput={(event) => {
							values.displayName = event.currentTarget.value;
							clearError('displayName');
						}}
						aria-invalid={!!errors.displayName}
						aria-describedby="{id('display-name-hint')}{errors.displayName
							? ` ${id('displayName-error')}`
							: ''}"
					/>
				</label>
				<p id={id('display-name-hint')} class="text-sm opacity-80">
					{#if builtIn}
						Leave empty to show “{builtIn.name}”.
					{:else}
						Leave empty to show the holiday's own name.
					{/if}
				</p>
				{@render fieldError('displayName')}
			</div>
		{:else}
			<div class="space-y-1">
				<label class="label" for={id('name')}>
					<span class="label-text">Name <span class="text-error-600-400">*</span></span>
					<input
						id={id('name')}
						data-initial-focus
						class={inputClass}
						autocomplete="off"
						aria-required="true"
						placeholder="e.g. Minimum Day"
						value={values.name}
						disabled={saving}
						oninput={(event) => {
							values.name = event.currentTarget.value;
							clearError('name');
						}}
						aria-invalid={!!errors.name}
						aria-describedby="{id('name-hint')}{errors.name ? ` ${id('name-error')}` : ''}"
					/>
				</label>
				<p id={id('name-hint')} class="text-sm opacity-80">
					{#if findBuiltIn(holidays, values.name)}
						{findBuiltIn(holidays, values.name)?.name} is a built-in holiday: this adds a second entry
						on your days. To change the holiday itself, choose “Change a built-in holiday”.
					{:else}
						Shown on the calendar under the picture (up to 3 lines).
					{/if}
				</p>
				{@render fieldError('name')}
			</div>

			<div data-invalid={errors.entries ? '' : undefined}>
				<DaysEditor
					bind:this={daysEditor}
					entries={values.entries}
					onChange={(entries: DayEntry[]) => {
						values.entries = entries;
						clearError('entries');
					}}
					{today}
					disabled={saving}
					error={errors.entries}
				/>
			</div>
		{/if}

		<div class="space-y-1" data-school>
			<SegmentedControl
				name={id('school')}
				orientation="horizontal"
				value={values.school}
				readOnly={saving}
				onValueChange={(details) => {
					if (details.value === 'none' || details.value === 'short' || details.value === 'full') {
						values.school = details.value;
						schoolTouched = true;
						clearError('school');
					}
				}}
				class="gap-1"
			>
				<SegmentedControl.Label>School that day</SegmentedControl.Label>
				<SegmentedControl.Control class="w-fit max-w-full p-1">
					<SegmentedControl.Indicator class="preset-filled-primary-500" />
					{#each schoolItems as item (item.value)}
						<SegmentedControl.Item
							value={item.value}
							class="px-1.5 py-2 text-sm leading-tight whitespace-normal sm:px-4 sm:text-base"
						>
							<SegmentedControl.ItemText>{item.label}</SegmentedControl.ItemText>
							<SegmentedControl.ItemHiddenInput />
						</SegmentedControl.Item>
					{/each}
				</SegmentedControl.Control>
			</SegmentedControl>
			<p class="text-sm opacity-80">
				{values.school === 'none'
					? 'The calendar says “No School!” that day.'
					: values.school === 'short'
						? 'The calendar says “Short Day!” that day.'
						: 'Just the name and picture.'}
				{#if builtIn && values.school !== builtIn.school}
					({builtIn.name}'s own: {SCHOOL_LABEL[builtIn.school]}.)
				{/if}
			</p>
			{@render fieldError('school')}
		</div>

		<fieldset
			class="border-surface-200-800 rounded-container space-y-3 border px-4 pt-2 pb-3"
			data-invalid={errors.icon || errors.image ? '' : undefined}
		>
			<legend class="label-text px-1">Picture</legend>
			<div class="flex flex-col gap-4 sm:flex-row sm:items-start">
				<div class="min-w-0 flex-1 space-y-1" role="radiogroup" aria-label="Picture">
					{#each pictureItems as item (item.value)}
						<label class="flex cursor-pointer items-center gap-3 py-1">
							<input
								type="radio"
								class="radio shrink-0"
								name={id('picture')}
								value={item.value}
								checked={values.picture === item.value}
								disabled={saving}
								onchange={() => choosePicture(item.value)}
							/>
							{item.label}
						</label>
					{/each}
					<p class="text-sm opacity-80" aria-live="polite" data-picture-used>
						The calendar shows {pictureWords}.
					</p>
				</div>
				{#if values.picture !== 'upload'}
					<div class="flex flex-col items-center gap-1">
						<DayCellPreview
							picture={values.picture === 'icon' ? iconUrl : ''}
							name={shownName}
							school={values.school}
							day={previewDay.getDate()}
						/>
						<span class="text-xs opacity-70">On the calendar</span>
					</div>
				{/if}
			</div>

			{#if values.picture === 'icon'}
				<IconChoice
					{icons}
					value={values.icon}
					status={iconsStatus}
					disabled={saving}
					error={errors.icon}
					errorId={id('icon-error')}
					onChange={(icon) => {
						values.icon = icon;
						clearError('icon');
					}}
				/>
			{/if}
			<!-- Kept while another option is chosen, so a picture chosen here isn't lost. -->
			<div class={values.picture === 'upload' ? '' : 'hidden'} data-upload>
				<PicturePicker
					field="image"
					currentUrl={savedImageUrl}
					bind:change={picture}
					bind:preparing={preparingPicture}
					disabled={saving}
					error={errors.image}
					onError={(text) => {
						if (text) errors.image = text;
						else clearError('image');
					}}
					label="Its picture (on this observance only)"
					emptyHint="Choose a picture, or drop one here. Reusable pictures go on the Icons page."
					removedHint="The picture is removed when you save. Choose a new one, or another option above."
					note="Square or wide pictures fit the calendar best."
					maxSide={SMALL_PICTURE_SIDE}
				>
					{#snippet preview(url)}
						<DayCellPreview
							picture={url}
							name={shownName}
							school={values.school}
							day={previewDay.getDate()}
						/>
					{/snippet}
				</PicturePicker>
			</div>
		</fieldset>

		<label class="label" for={id('notes')}>
			<span class="label-text">Notes (not shown on the slides)</span>
			<textarea
				id={id('notes')}
				class="textarea px-3 py-2 text-base"
				rows="2"
				value={values.notes}
				disabled={saving}
				oninput={(event) => (values.notes = event.currentTarget.value)}></textarea>
		</label>
		{@render fieldError('notes')}

		{#if values.kind === 'builtin'}
			<div class="grid gap-x-4 gap-y-2 sm:grid-cols-2">
				<div>
					<LabeledSwitch
						label="Hide this holiday"
						checked={values.hidden}
						readOnly={saving}
						describedBy={id('hidden-help')}
						onCheckedChange={(checked) => (values.hidden = checked)}
						class="-ml-2"
					/>
					<p id={id('hidden-help')} class="text-sm opacity-80">
						On: {builtIn?.name ?? 'the holiday'} isn't on the calendar at all{observedDay
							? ', nor its observed day'
							: ''}.
					</p>
				</div>
				<div>
					<LabeledSwitch
						label="Use these changes"
						checked={values.active}
						readOnly={saving}
						describedBy={id('active-help')}
						onCheckedChange={(checked) => (values.active = checked)}
						class="-ml-2"
					/>
					<p id={id('active-help')} class="text-sm opacity-80">
						Off: the name, picture, school day and notes above aren't used; {builtIn?.name ??
							'the holiday'} shows as it comes (unless it is hidden).
					</p>
				</div>
			</div>
			{@render fieldError('hidden')}
		{:else}
			<div>
				<LabeledSwitch
					label="Show on the calendar"
					checked={values.active}
					readOnly={saving}
					describedBy={id('active-help')}
					onCheckedChange={(checked) => (values.active = checked)}
					class="-ml-2"
				/>
				<p id={id('active-help')} class="text-sm opacity-80">
					Off: kept here, but not on the calendar (e.g. until next year).
				</p>
			</div>
		{/if}
		{@render fieldError('active')}
	</div>

	<footer class="border-surface-200-800 shrink-0 space-y-3 border-t px-6 py-3">
		{#if message}
			<p class="card preset-tonal-error px-3 py-2 text-sm font-semibold" role="alert">
				{message}
			</p>
		{/if}
		<div class="flex flex-wrap justify-end gap-3">
			<!-- Not while saving: the dialog would close with the save still on its way. -->
			<button type="button" class="btn preset-tonal px-5 py-2" disabled={saving} onclick={onCancel}>
				Cancel
			</button>
			<button
				type="submit"
				class="btn preset-filled-primary-500 px-5 py-2"
				disabled={saving || preparingPicture}
			>
				{#if sending}
					Saving…
				{:else}
					{original ? 'Save changes' : values.kind === 'builtin' ? 'Save the changes' : 'Add'}
				{/if}
			</button>
		</div>
	</footer>
</form>
