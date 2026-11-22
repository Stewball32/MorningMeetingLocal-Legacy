<script lang="ts">
	import { Dialog, SegmentedControl } from '@skeletonlabs/skeleton-svelte';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import ImageOff from '@lucide/svelte/icons/image-off';
	import Undo from '@lucide/svelte/icons/undo-2';
	import { onDestroy, tick, untrack } from 'svelte';
	import type { Person } from '#lib/pb/types.ts';
	import { createPerson, personAvatarUrl, updatePerson } from '#lib/pb/people.ts';
	import { AVATAR_ACCEPT, prepareAvatar } from './avatar.ts';
	import { describeError } from './errors.ts';
	import {
		changedFields,
		emptyForm,
		fieldsFromForm,
		formFromPerson,
		validateForm,
		type FormErrors,
		type FormField,
		type PersonFormValues
	} from './form.ts';
	import LabeledSwitch from './LabeledSwitch.svelte';
	import PersonAvatar from './PersonAvatar.svelte';
	import { displayName, groupOf } from './people.ts';
	import { formatTime, parseTime, parseYouTube, slideVideoUrl } from './youtube.ts';

	interface Props {
		/** The person to edit, or null to add someone new. */
		person: Person | null;
		/** Starting values for someone new (e.g. Add teacher). */
		preset?: Partial<PersonFormValues>;
		onSaved: (person: Person, created: boolean) => void;
		onCancel: () => void;
	}

	let { person, preset = {}, onSaved, onCancel }: Props = $props();

	// The form works on its own copy, taken when the dialog opens: a live update to this person
	// from another window never overwrites what is being typed here.
	const original = untrack(() => person);
	let values: PersonFormValues = $state(
		untrack(() => (original ? formFromPerson(original) : emptyForm(preset)))
	);
	let errors: FormErrors = $state({});
	let message = $state('');
	let saving = $state(false);

	const clearError = (field: FormField) => {
		if (errors[field]) errors[field] = undefined;
		if (message && !Object.values(errors).some(Boolean)) message = '';
	};

	// --- Picture -----------------------------------------------------------------------------

	const currentPictureUrl = original?.avatar ? personAvatarUrl(original) : '';
	let newPicture: File | null = $state(null);
	let newPictureUrl = $state('');
	let removePicture = $state(false);
	let preparingPicture = $state(false);
	let dragging = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	const pictureUrl = $derived(newPictureUrl || (removePicture ? '' : currentPictureUrl));
	const pictureChanged = $derived(!!newPicture || removePicture);

	const forgetNewPicture = () => {
		if (newPictureUrl) URL.revokeObjectURL(newPictureUrl);
		newPicture = null;
		newPictureUrl = '';
	};
	onDestroy(forgetNewPicture);

	async function usePicture(file: File | null | undefined) {
		if (!file) return;
		clearError('avatar');
		preparingPicture = true;
		const result = await prepareAvatar(file);
		preparingPicture = false;
		if ('error' in result) {
			errors.avatar = result.error;
			return;
		}
		forgetNewPicture();
		newPicture = result.file;
		newPictureUrl = URL.createObjectURL(result.file);
		removePicture = false;
	}

	function onFileChosen(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = ''; // so choosing the same file again still counts
		usePicture(file);
	}

	function onRemovePicture() {
		forgetNewPicture();
		removePicture = !!currentPictureUrl;
		clearError('avatar');
	}

	function onKeepPicture() {
		forgetNewPicture();
		removePicture = false;
		clearError('avatar');
	}

	const isFileDrag = (event: DragEvent) => !!event.dataTransfer?.types.includes('Files');

	// --- Video -------------------------------------------------------------------------------

	const video = $derived(parseYouTube(values.video));
	const start = $derived(parseTime(values.start));
	const end = $derived(parseTime(values.end));
	const testUrl = $derived(
		video.kind === 'video'
			? slideVideoUrl({ video_id: video.id, video_start: start ?? 0, video_end: end ?? 0 })
			: ''
	);
	let timesFromLink = $state(false);
	// A pasted link with ?t=90 fills in the start time once; editing the start afterwards sticks,
	// even if the link text is touched again.
	let appliedLink = '';
	function applyLinkTimes(text: string) {
		const parsed = parseYouTube(text);
		if (parsed.kind !== 'video') return;
		const key = `${parsed.id}|${parsed.start ?? ''}|${parsed.end ?? ''}`;
		if (key === appliedLink) return;
		appliedLink = key;
		if (parsed.start !== undefined) {
			values.start = String(parsed.start);
			clearError('start');
			timesFromLink = true;
		}
		if (parsed.end !== undefined) {
			values.end = String(parsed.end);
			clearError('end');
			timesFromLink = true;
		}
	}

	type TextField = 'name' | 'title' | 'video' | 'start' | 'end';
	function setText(field: TextField, text: string) {
		values[field] = text;
		clearError(field);
		if (field === 'start' || field === 'end') timesFromLink = false;
		if (field === 'video') applyLinkTimes(text);
	}

	const timeHint = (seconds: number | undefined, text: string, empty: string) => {
		if (!text.trim()) return empty;
		if (seconds === undefined) return '';
		return `${formatTime(seconds)} (${seconds} ${seconds === 1 ? 'second' : 'seconds'})`;
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
		const problems = validateForm(values);
		errors = { ...problems, avatar: errors.avatar };
		if (Object.values(problems).some(Boolean)) {
			message = 'Please fix the highlighted fields.';
			focusFirstError();
			return;
		}

		saving = true;
		message = '';
		try {
			const fields = fieldsFromForm(values);
			const saved = original
				? await updatePerson(
						original.id,
						changedFields(fieldsFromForm(formFromPerson(original)), fields),
						newPicture ?? (removePicture ? null : undefined)
					)
				: await createPerson(fields, newPicture);
			onSaved(saved, !original);
		} catch (error) {
			const problem = describeError(
				error,
				original ? `save ${displayName(original)}` : `add ${values.name.trim()}`,
				{ form: true }
			);
			errors = problem.fields;
			message = problem.message;
			if (Object.keys(problem.fields).length > 0) focusFirstError();
		} finally {
			saving = false;
		}
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
			<!-- Picture: choose, drop, replace, remove -->
			<div
				role="group"
				aria-labelledby={id('picture-label')}
				class="rounded-container flex shrink-0 flex-col items-center gap-2 p-2 md:w-52 {dragging
					? 'ring-primary-500 bg-primary-50-950 ring-4'
					: ''}"
				ondragover={(event) => {
					if (!isFileDrag(event)) return;
					event.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={(event) => {
					if (!isFileDrag(event)) return;
					event.preventDefault();
					dragging = false;
					usePicture(event.dataTransfer?.files?.[0]);
				}}
			>
				<span id={id('picture-label')} class="label-text self-start">Picture</span>
				<PersonAvatar src={pictureUrl} alt="" class="size-32" />
				<input
					bind:this={fileInput}
					type="file"
					accept={AVATAR_ACCEPT}
					class="hidden"
					onchange={onFileChosen}
					aria-hidden="true"
					tabindex="-1"
				/>
				<div class="flex flex-wrap justify-center gap-2">
					<button
						type="button"
						class="btn preset-tonal-primary px-3 py-2"
						disabled={preparingPicture}
						aria-describedby={id('picture-status')}
						onclick={() => fileInput?.click()}
					>
						<ImagePlus class="size-5" aria-hidden="true" />
						{pictureUrl ? 'Replace picture' : 'Choose picture'}
					</button>
					{#if pictureUrl}
						<button
							type="button"
							class="btn preset-tonal-error px-3 py-2"
							disabled={preparingPicture}
							onclick={onRemovePicture}
						>
							<ImageOff class="size-5" aria-hidden="true" />
							Remove picture
						</button>
					{/if}
					{#if pictureChanged && currentPictureUrl}
						<button type="button" class="btn preset-tonal px-3 py-2" onclick={onKeepPicture}>
							<Undo class="size-5" aria-hidden="true" />
							Keep the old picture
						</button>
					{/if}
				</div>
				<p id={id('picture-status')} class="text-center text-xs opacity-80" aria-live="polite">
					{#if preparingPicture}
						Getting the picture ready…
					{:else if newPicture}
						New picture chosen; it is uploaded when you save.
					{:else if removePicture}
						The picture is removed when you save; the slides then show the default one.
					{:else if pictureUrl}
						Or drop a new picture here.
					{:else}
						No picture: the slides show this default one. Or drop a picture here.
					{/if}
				</p>
				{@render fieldError('avatar')}
			</div>

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
							Video <code class="font-mono">{video.id}</code>{timesFromLink
								? ', times taken from the link'
								: ''}
						{:else if video.kind === 'empty'}
							A YouTube link (watch, youtu.be, shorts, embed) or an 11-character video ID.
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
			<button type="button" class="btn preset-tonal px-5 py-2" onclick={onCancel}>Cancel</button>
			<button
				type="submit"
				class="btn preset-filled-primary-500 px-5 py-2"
				disabled={saving || preparingPicture}
			>
				{#if saving}
					Saving…
				{:else}
					{original ? 'Save changes' : 'Add person'}
				{/if}
			</button>
		</div>
	</footer>
</form>
