<script lang="ts">
	import { Dialog, SegmentedControl } from '@skeletonlabs/skeleton-svelte';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { tick, untrack } from 'svelte';
	import { describeError } from '#lib/editor/errors.ts';
	import { changedFields, type SaveOutcome } from '#lib/editor/form.ts';
	import LabeledSwitch from '#lib/editor/LabeledSwitch.svelte';
	import PicturePicker from '#lib/editor/PicturePicker.svelte';
	import type { Person } from '#lib/pb/types.ts';
	import { createPerson, personAvatarUrl, updatePerson } from '#lib/pb/people.ts';
	import type { FileChange } from '#lib/pb/requests.ts';
	import { MONTH_NAMES } from '#lib/birthdays.ts';
	import {
		birthdayDayChoices,
		emptyForm,
		FORM_FIELD_OF,
		fieldsFromForm,
		formFromPerson,
		sameForm,
		unreadableBirthday,
		validateForm,
		withBirthdayMonth,
		type FormErrors,
		type FormField,
		type PersonFormValues
	} from './form.ts';
	import PersonAvatar from './PersonAvatar.svelte';
	import { displayName, groupOf, PERSON_ERRORS } from './people.ts';
	import {
		MAX_SECONDS,
		describeTimeIssues,
		formatTime,
		parseTime,
		parseYouTube,
		slideVideoUrl
	} from './youtube.ts';

	interface Props {
		/** The person to edit, or null to add someone new. */
		person: Person | null;
		/** Starting values for someone new (e.g. Add teacher). */
		preset?: Partial<PersonFormValues>;
		onSaved: (person: Person, outcome: SaveOutcome) => void;
		onCancel: () => void;
	}

	let { person, preset = {}, onSaved, onCancel }: Props = $props();

	// The form works on its own copy, taken when the dialog opens: a live update to this person
	// from another window never overwrites what is being typed here.
	const original = untrack(() => person);
	/** What the form started with, to tell what the teacher changed. */
	const initial: PersonFormValues = untrack(() =>
		original ? formFromPerson(original) : emptyForm(preset)
	);
	let values: PersonFormValues = $state({ ...initial });
	let errors: FormErrors = $state({});
	let message = $state('');
	/** A save is on its way, or done (the dialog is then closing): the form takes no more input. */
	let saving = $state(false);
	/** The save request is on its way (the button says so; not while the dialog closes). */
	let sending = $state(false);

	const clearError = (field: FormField) => {
		if (errors[field]) errors[field] = undefined;
		if (message && !Object.values(errors).some(Boolean)) message = '';
	};

	// --- Picture -----------------------------------------------------------------------------

	const currentPictureUrl = original?.avatar ? personAvatarUrl(original) : '';
	/** What to send for the picture (see PicturePicker). */
	let picture: FileChange = $state();
	let preparingPicture = $state(false);

	// --- Video -------------------------------------------------------------------------------

	const video = $derived(parseYouTube(values.video));
	/** A video ID saved long ago that isn't one: it is kept as it is unless it is changed. */
	const oddSavedVideo = $derived(
		video.kind === 'invalid' &&
			!!initial.video.trim() &&
			values.video.trim() === initial.video.trim()
	);
	const start = $derived(parseTime(values.start));
	const end = $derived(parseTime(values.end));
	const testUrl = $derived(
		video.kind === 'video'
			? slideVideoUrl({ video_id: video.id, video_start: start ?? 0, video_end: end ?? 0 })
			: ''
	);

	/** Which times were filled in from the link (until they are edited). */
	let fromLink = $state({ start: false, end: false });
	/** The times were cleared because another video was chosen. */
	let timesReset = $state(false);
	/** The video the times belong to; '' when they were typed with no video (for the next one). */
	let timesFor = untrack(() => {
		const parsed = parseYouTube(initial.video);
		return parsed.kind === 'video' ? parsed.id : initial.video.trim();
	});
	// A pasted link with ?t=90 fills in the start time once; editing the start afterwards sticks,
	// even if the link text is touched again.
	let appliedLink = '';
	function applyLink(text: string) {
		const parsed = parseYouTube(text);
		if (parsed.kind !== 'video') return;
		const key = `${parsed.id}|${parsed.start ?? ''}|${parsed.end ?? ''}`;
		if (key === appliedLink) return;
		appliedLink = key;
		if (timesFor && timesFor !== parsed.id) {
			// Another video: the old one's times don't fit it.
			timesReset = !!(values.start.trim() || values.end.trim());
			values.start = '';
			values.end = '';
			fromLink = { start: false, end: false };
		}
		timesFor = parsed.id;
		for (const field of ['start', 'end'] as const) {
			const seconds = parsed[field];
			if (seconds !== undefined) {
				values[field] = String(seconds);
				fromLink[field] = true;
			} else if (fromLink[field]) {
				// It came from an earlier version of the link, which had it.
				values[field] = '';
				fromLink[field] = false;
			}
			clearError(field);
		}
	}

	/** After "Video <id>": where the times came from, and link times that couldn't be used. */
	const videoNote = $derived.by(() => {
		if (video.kind !== 'video') return '';
		const times =
			fromLink.start || fromLink.end
				? ', times taken from the link'
				: timesReset
					? ', times reset for the new video'
					: '';
		const issues = video.issues
			? `. ${describeTimeIssues(video.issues)} Enter the time below.`
			: '';
		return times + issues;
	});

	type TextField = 'name' | 'title' | 'video' | 'start' | 'end';
	function setText(field: TextField, text: string) {
		values[field] = text;
		clearError(field);
		if (field === 'video') applyLink(text);
		if (field === 'start' || field === 'end') {
			fromLink[field] = false;
			timesReset = false;
			if (video.kind !== 'invalid') timesFor = video.kind === 'video' ? video.id : '';
		}
	}

	const timeHint = (seconds: number | undefined, text: string, empty: string) => {
		if (!text.trim()) return empty;
		if (seconds === undefined || seconds > MAX_SECONDS) return '';
		const shown = `${formatTime(seconds)} (${seconds} ${seconds === 1 ? 'second' : 'seconds'})`;
		return video.kind === 'empty' ? `${shown}; not used without a video` : shown;
	};

	// --- Where they show up ------------------------------------------------------------------

	const shownAs = $derived(
		displayName({
			name: values.name.trim() || '(name)',
			title: values.role === 'teacher' ? values.title.trim() : ''
		})
	);
	const showsUp = $derived(
		{
			teachers: 'on the teacher attendance page',
			students: 'on the student attendance page',
			guests: 'only in the guest list (Add Guest on the guest page)',
			inactive: ''
		}[groupOf(values)]
	);

	// --- Birthday ----------------------------------------------------------------------------

	/** The Day select's choices: up to 29 in February, none until a month is chosen. */
	const birthdayDays = $derived(birthdayDayChoices(values.birthdayMonth));
	/** A saved birthday that isn't a real day (from the dashboard): kept unless one is chosen. */
	const oddSavedBirthday = unreadableBirthday(original);
	const birthdayWho = $derived(values.name.trim() ? shownAs : 'this person');

	function setBirthdayMonth(month: string) {
		const next = withBirthdayMonth(values, month);
		values.birthdayMonth = next.birthdayMonth;
		values.birthdayDay = next.birthdayDay;
		clearError('birthday');
	}

	// --- Save --------------------------------------------------------------------------------

	const title = original ? `Edit ${displayName(original)}` : 'Add a person';
	const idPrefix = $props.id();
	const id = (field: string) => `${idPrefix}-${field}`;

	async function focusFirstError() {
		await tick();
		document.querySelector<HTMLElement>(`[data-person-form] [aria-invalid="true"]`)?.focus();
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (saving || preparingPicture) return;
		const problems = validateForm(values, original ? initial : undefined);
		errors = { ...problems, avatar: errors.avatar };
		if (Object.values(problems).some(Boolean)) {
			message = 'Please fix the highlighted fields.';
			focusFirstError();
			return;
		}

		const fields = fieldsFromForm(values);
		const avatar = picture;
		const changes = original ? changedFields(fieldsFromForm(initial), fields) : fields;
		// Once saved, the form stays locked while the dialog closes: a second Enter in that moment
		// must not save (or add the person) again.
		saving = true;
		message = '';
		if (original && Object.keys(changes).length === 0 && avatar === undefined) {
			// Nothing to send: no request, no realtime update for every open presenter.
			onSaved(original, 'unchanged');
			return;
		}
		sending = true;
		try {
			const saved = original
				? await updatePerson(original.id, changes, avatar)
				: await createPerson(fields, picture);
			sending = false;
			onSaved(saved, original ? 'saved' : 'created');
		} catch (error) {
			sending = false;
			saving = false;
			const problem = describeError(
				error,
				original ? `save ${displayName(original)}` : `add ${values.name.trim()}`,
				{ ...PERSON_ERRORS, fieldOf: FORM_FIELD_OF }
			);
			errors = problem.fields;
			message = problem.message;
			if (Object.keys(problem.fields).length > 0) focusFirstError();
		}
	}

	/** For Escape: the dialog stays open while saving, and asks before changes are thrown away. */
	export function canClose(): boolean {
		if (saving) return false;
		if (picture === undefined && !preparingPicture && sameForm(values, initial)) return true;
		return confirm('Discard your changes?');
	}

	const roleItems = [
		{ value: 'student', label: 'Student' },
		{ value: 'teacher', label: 'Teacher' }
	];
	const pronounItems = [
		{ value: 'he', label: 'He' },
		{ value: 'she', label: 'She' },
		{ value: 'none', label: 'Not set' }
	];
	const segmentItemClass = 'px-4 py-2';
	const inputClass = 'input placeholder:text-surface-400-600 px-3 py-2 text-base';
</script>

{#snippet fieldError(field: FormField)}
	{#if errors[field]}
		<p id={id(`${field}-error`)} class="text-error-700-300 text-sm font-semibold">
			{errors[field]}
		</p>
	{/if}
{/snippet}

<form class="flex min-h-0 flex-1 flex-col" novalidate onsubmit={save} data-person-form>
	<header class="border-surface-200-800 shrink-0 border-b px-6 py-3">
		<Dialog.Title class="h4 truncate">{title}</Dialog.Title>
	</header>

	<div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-3">
		<div class="flex flex-col gap-5 md:flex-row">
			<PicturePicker
				field="avatar"
				currentUrl={currentPictureUrl}
				bind:change={picture}
				bind:preparing={preparingPicture}
				disabled={saving}
				error={errors.avatar}
				onError={(text) => {
					if (text) errors.avatar = text;
					else clearError('avatar');
				}}
				class="md:w-52"
			>
				{#snippet preview(url)}
					<PersonAvatar src={url} alt="" class="size-32" />
				{/snippet}
			</PicturePicker>

			<div class="min-w-0 flex-1 space-y-4">
				<div class="flex gap-3">
					{#if values.role === 'teacher'}
						<label class="label w-28 shrink-0" for={id('title')}>
							<span class="label-text">Title</span>
							<input
								id={id('title')}
								class={inputClass}
								autocomplete="off"
								placeholder="Mr."
								value={values.title}
								oninput={(event) => setText('title', event.currentTarget.value)}
								aria-invalid={!!errors.title}
								aria-describedby={errors.title ? id('title-error') : undefined}
							/>
						</label>
					{/if}
					<label class="label min-w-0 flex-1" for={id('name')}>
						<span class="label-text">Name <span class="text-error-600-400">*</span></span>
						<input
							id={id('name')}
							data-initial-focus
							class={inputClass}
							autocomplete="off"
							aria-required="true"
							value={values.name}
							oninput={(event) => setText('name', event.currentTarget.value)}
							aria-invalid={!!errors.name}
							aria-describedby="{id('shown-as')}{errors.name ? ` ${id('name-error')}` : ''}"
						/>
					</label>
				</div>
				{@render fieldError('title')}
				{@render fieldError('name')}

				<div class="grid gap-4 sm:grid-cols-2">
					<SegmentedControl
						name="role"
						orientation="horizontal"
						value={values.role}
						onValueChange={(details) => {
							if (details.value === 'student' || details.value === 'teacher') {
								values.role = details.value;
								clearError('role');
							}
						}}
						class="gap-1"
					>
						<SegmentedControl.Label>Role</SegmentedControl.Label>
						<SegmentedControl.Control class="p-1">
							<SegmentedControl.Indicator class="preset-filled-primary-500" />
							{#each roleItems as item (item.value)}
								<SegmentedControl.Item value={item.value} class={segmentItemClass}>
									<SegmentedControl.ItemText>{item.label}</SegmentedControl.ItemText>
									<SegmentedControl.ItemHiddenInput />
								</SegmentedControl.Item>
							{/each}
						</SegmentedControl.Control>
					</SegmentedControl>
					<SegmentedControl
						name="pronoun"
						orientation="horizontal"
						value={values.pronoun || 'none'}
						onValueChange={(details) => {
							values.pronoun =
								details.value === 'he' || details.value === 'she' ? details.value : '';
						}}
						class="gap-1"
					>
						<SegmentedControl.Label>Pronoun</SegmentedControl.Label>
						<SegmentedControl.Control class="p-1">
							<SegmentedControl.Indicator class="preset-filled-primary-500" />
							{#each pronounItems as item (item.value)}
								<SegmentedControl.Item value={item.value} class={segmentItemClass}>
									<SegmentedControl.ItemText>{item.label}</SegmentedControl.ItemText>
									<SegmentedControl.ItemHiddenInput />
								</SegmentedControl.Item>
							{/each}
						</SegmentedControl.Control>
					</SegmentedControl>
				</div>
				{@render fieldError('role')}
				{@render fieldError('pronoun')}

				<fieldset class="space-y-1" data-birthday>
					<legend class="label-text">Birthday</legend>
					<div class="flex flex-wrap items-end gap-3">
						<label class="label w-44" for={id('birthday-month')}>
							<span class="text-sm opacity-80">Month</span>
							<select
								id={id('birthday-month')}
								class="select px-3 py-2 text-base"
								value={values.birthdayMonth}
								onchange={(event) => setBirthdayMonth(event.currentTarget.value)}
								aria-invalid={!!errors.birthday && !values.birthdayMonth}
								aria-describedby="{id('birthday-hint')}{errors.birthday
									? ` ${id('birthday-error')}`
									: ''}"
							>
								<option value="">—</option>
								{#each MONTH_NAMES as month, index (month)}
									<option value={String(index + 1)}>{month}</option>
								{/each}
							</select>
						</label>
						<label class="label w-24" for={id('birthday-day')}>
							<span class="text-sm opacity-80">Day</span>
							<select
								id={id('birthday-day')}
								class="select px-3 py-2 text-base"
								value={values.birthdayDay}
								disabled={!values.birthdayMonth}
								onchange={(event) => {
									values.birthdayDay = event.currentTarget.value;
									clearError('birthday');
								}}
								aria-invalid={!!errors.birthday && !!values.birthdayMonth}
								aria-describedby="{id('birthday-hint')}{errors.birthday
									? ` ${id('birthday-error')}`
									: ''}"
							>
								<option value="">—</option>
								{#each birthdayDays as day (day)}
									<option value={String(day)}>{day}</option>
								{/each}
							</select>
						</label>
					</div>
					<p id={id('birthday-hint')} class="text-sm opacity-80">
						{#if oddSavedBirthday && !values.birthdayMonth}
							The saved birthday <code class="font-mono">{oddSavedBirthday}</code> isn't a real day, so
							the calendar doesn't show it. It is kept as it is unless you choose a month and day.
						{:else}
							Shown on the calendar every year while {birthdayWho} is active. No year needed.{values.birthdayMonth ===
								'2' && values.birthdayDay === '29'
								? ' In years without Feb 29, it is on Feb 28.'
								: ''}
						{/if}
					</p>
					{@render fieldError('birthday')}
				</fieldset>

				<div class="grid gap-x-4 gap-y-2 sm:grid-cols-2">
					<div>
						<LabeledSwitch
							label="Active"
							checked={values.active}
							describedBy={id('active-help')}
							onCheckedChange={(checked) => (values.active = checked)}
							class="-ml-2"
						/>
						<p id={id('active-help')} class="text-sm opacity-80">
							Off hides them from every slide; their attendance history is kept.
						</p>
					</div>
					<div>
						<LabeledSwitch
							label="Guest"
							checked={values.is_guest}
							describedBy={id('guest-help')}
							onCheckedChange={(checked) => (values.is_guest = checked)}
							class="-ml-2"
						/>
						<p id={id('guest-help')} class="text-sm opacity-80">
							Regular visitors: only in the guest list, not on the attendance pages.
						</p>
					</div>
				</div>
				<p id={id('shown-as')} class="preset-tonal rounded-base px-3 py-2 text-sm">
					{#if values.active}
						Shown as <strong class="font-semibold">{shownAs}</strong>
						{showsUp}.
					{:else}
						<strong class="font-semibold">{shownAs}</strong> is inactive: hidden from the slides, history
						kept.
					{/if}
				</p>
			</div>
		</div>

		<!-- Welcome video -->
		<fieldset class="border-surface-200-800 rounded-container space-y-2 border px-4 pt-2 pb-3">
			<legend class="label-text px-1">Welcome video</legend>
			<div class="grid gap-3 sm:grid-cols-[1fr_9rem_9rem]">
				<div class="space-y-1">
					<label class="label" for={id('video')}>
						<span class="label-text">YouTube link or video ID</span>
						<input
							id={id('video')}
							class={inputClass}
							autocomplete="off"
							spellcheck="false"
							placeholder="Paste a YouTube link"
							value={values.video}
							oninput={(event) => setText('video', event.currentTarget.value)}
							aria-invalid={!!errors.video}
							aria-describedby="{id('video-hint')}{errors.video ? ` ${id('video-error')}` : ''}"
						/>
					</label>
					<p id={id('video-hint')} class="text-sm opacity-80">
						{#if video.kind === 'video'}
							Video <code class="font-mono">{video.id}</code>{videoNote}
						{:else if video.kind === 'empty'}
							A YouTube link (watch, youtu.be, shorts, embed) or an 11-character video ID.
						{:else if oddSavedVideo}
							The saved video ID <code class="font-mono break-all">{initial.video.trim()}</code> doesn't
							look like a YouTube video ID; it is kept as it is unless you change it.
						{/if}
					</p>
					{@render fieldError('video')}
				</div>
				<div class="space-y-1">
					<label class="label" for={id('start')}>
						<span class="label-text">Start at</span>
						<input
							id={id('start')}
							class={inputClass}
							inputmode="numeric"
							autocomplete="off"
							placeholder="e.g. 0:15"
							value={values.start}
							oninput={(event) => setText('start', event.currentTarget.value)}
							aria-invalid={!!errors.start}
							aria-describedby="{id('start-hint')}{errors.start ? ` ${id('start-error')}` : ''}"
						/>
					</label>
					<p id={id('start-hint')} class="text-sm opacity-80">
						{timeHint(start, values.start, 'from the start')}
					</p>
				</div>
				<div class="space-y-1">
					<label class="label" for={id('end')}>
						<span class="label-text">End at</span>
						<input
							id={id('end')}
							class={inputClass}
							inputmode="numeric"
							autocomplete="off"
							placeholder="e.g. 0:45"
							value={values.end}
							oninput={(event) => setText('end', event.currentTarget.value)}
							aria-invalid={!!errors.end}
							aria-describedby="{id('end-hint')}{errors.end ? ` ${id('end-error')}` : ''}"
						/>
					</label>
					<p id={id('end-hint')} class="text-sm opacity-80">
						{timeHint(end, values.end, 'to the end')}
					</p>
				</div>
			</div>
			{@render fieldError('start')}
			{@render fieldError('end')}
			{#if testUrl}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- an external YouTube link -->
				<a
					href={testUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="btn preset-tonal px-3 py-2"
				>
					<ExternalLink class="size-5" aria-hidden="true" />
					Test the video (opens YouTube like the slides do)
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</fieldset>
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
					{original ? 'Save changes' : 'Add person'}
				{/if}
			</button>
		</div>
	</footer>
</form>
