<!--
	@component
	The Add / Edit icon form (inside IconFormDialog): name, emoji (with a palette), a switch per use,
	and the picture with previews of how the slides show it. Works like the People form: it edits its
	own copy, sends only what changed (nothing at all when nothing did), can't be saved twice, and
	asks before Escape throws changes away.
-->
<script lang="ts">
	import { Dialog } from '@skeletonlabs/skeleton-svelte';
	import { tick, untrack } from 'svelte';
	import { describeError } from '#lib/editor/errors.ts';
	import { changedFields, hasErrors, type SaveOutcome } from '#lib/editor/form.ts';
	import LabeledSwitch from '#lib/editor/LabeledSwitch.svelte';
	import { SMALL_PICTURE_SIDE } from '#lib/editor/picture.ts';
	import PicturePicker from '#lib/editor/PicturePicker.svelte';
	import { createIcon, iconPictureUrl, updateIcon } from '#lib/pb/icons.ts';
	import type { FileChange } from '#lib/pb/requests.ts';
	import type { IconRecord } from '#lib/pb/types.ts';
	import { emojiProblem } from './emoji.ts';
	import EmojiPalette from './EmojiPalette.svelte';
	import {
		emptyForm,
		FORM_FIELD_OF,
		fieldsFromForm,
		formFromIcon,
		isNameEmojiTaken,
		PICTURE_NEEDED,
		sameForm,
		takenMessage,
		validateForm,
		type FormErrors,
		type FormField,
		type IconFormValues
	} from './form.ts';
	import IconPreview from './IconPreview.svelte';
	import { ICON_ERRORS, iconLabel } from './icons.ts';
	import { USES } from './uses.ts';

	interface Props {
		/** The icon to edit, or null to add a new one. */
		icon: IconRecord | null;
		/** Values to start with: for a new icon (e.g. Guests on), or changes to an icon's. */
		preset?: Partial<IconFormValues>;
		/** Opened because Guests was turned on for an icon without a picture: say it needs one. */
		pictureNeeded?: boolean;
		onSaved: (icon: IconRecord, outcome: SaveOutcome) => void;
		onCancel: () => void;
	}

	let { icon, preset = {}, pictureNeeded = false, onSaved, onCancel }: Props = $props();

	// The form works on its own copy, taken when the dialog opens: a live update to this icon from
	// another window never overwrites what is being typed here.
	const original = untrack(() => icon);
	/** What the form started with, to tell what the teacher changed. */
	const initial: IconFormValues = untrack(() =>
		original ? formFromIcon(original) : emptyForm(preset)
	);
	/** What the dialog opened with: the saved values plus the preset (e.g. Guests turned on). */
	const opened: IconFormValues = untrack(() => ({ ...initial, ...(original ? preset : {}) }));
	let values: IconFormValues = $state({ ...opened });
	let errors: FormErrors = $state(untrack(() => (pictureNeeded ? { image: PICTURE_NEEDED } : {})));
	let message = $state('');
	/** A save is on its way, or done (the dialog is then closing): the form takes no more input. */
	let saving = $state(false);
	/** The save request is on its way (the button says so; not while the dialog closes). */
	let sending = $state(false);
	/** PocketBase said another icon has this name and emoji: changing either clears both. */
	let taken = $state(false);

	const clearError = (field: FormField) => {
		if (errors[field]) errors[field] = undefined;
		if (message && !hasErrors(errors)) message = '';
	};

	function setText(field: 'name' | 'emoji', text: string) {
		values[field] = text;
		clearError(field);
		if (taken) {
			taken = false;
			clearError(field === 'name' ? 'emoji' : 'name');
		}
	}

	// --- Picture -----------------------------------------------------------------------------

	const currentPictureUrl = original?.image ? iconPictureUrl(original) : '';
	/** What to send for the picture (see PicturePicker). */
	let picture: FileChange = $state();
	let preparingPicture = $state(false);
	/** Whether the icon has a picture once saved. */
	const hasPicture = $derived(
		picture instanceof File || (picture === undefined && !!original?.image)
	);

	// --- Emoji -------------------------------------------------------------------------------

	const emojiChanged = $derived(!original || values.emoji.trim() !== initial.emoji.trim());
	/** An emoji saved long ago that isn't a single one: it is kept as it is unless it is changed. */
	const oddSavedEmoji = $derived(
		!!original && !emojiChanged && !!initial.emoji.trim() && !!emojiProblem(initial.emoji)
	);

	// --- Save --------------------------------------------------------------------------------

	const title = original ? `Edit ${iconLabel(original)}` : 'Add an icon';
	const idPrefix = $props.id();
	const id = (field: string) => `${idPrefix}-${field}`;

	async function focusFirstError() {
		await tick();
		const field = document.querySelector<HTMLElement>('[data-icon-form] [aria-invalid="true"]');
		if (field) field.focus();
		else if (errors.image)
			document.querySelector<HTMLElement>('[data-icon-form] [data-picture] button')?.focus();
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (saving || preparingPicture) return;
		const problems = validateForm(values, {
			start: original ? initial : undefined,
			hasPicture
		});
		// A picture that couldn't be used keeps its message (the saved one stays as it is).
		const pictureError = errors.image === PICTURE_NEEDED ? undefined : errors.image;
		errors = { ...problems, image: problems.image ?? pictureError };
		taken = false;
		if (hasErrors(problems)) {
			message = 'Please fix the highlighted fields.';
			focusFirstError();
			return;
		}

		const fields = fieldsFromForm(values);
		const image = picture;
		const changes = original ? changedFields(fieldsFromForm(initial), fields) : fields;
		// Once saved, the form stays locked while the dialog closes: a second Enter in that moment
		// must not save (or add the icon) again.
		saving = true;
		message = '';
		if (original && Object.keys(changes).length === 0 && image === undefined) {
			// Nothing to send: no request, no realtime update for every open presenter.
			onSaved(original, 'unchanged');
			return;
		}
		const doing = original ? `save ${original.name}` : `add ${fields.name}`;
		sending = true;
		try {
			const saved = original
				? await updateIcon(original.id, changes, image)
				: await createIcon(fields, image);
			sending = false;
			onSaved(saved, original ? 'saved' : 'created');
		} catch (error) {
			sending = false;
			saving = false;
			if (isNameEmojiTaken(error)) {
				taken = true;
				errors = {
					...errors,
					name: 'Already used with this emoji.',
					emoji: 'Already used with this name.'
				};
				message = `${takenMessage(fields.name)} Change the name or pick another emoji.`;
				focusFirstError();
				return;
			}
			const problem = describeError(error, doing, { ...ICON_ERRORS, fieldOf: FORM_FIELD_OF });
			errors = problem.fields;
			message = problem.message;
			if (hasErrors(problem.fields)) focusFirstError();
		}
	}

	/** For Escape: the dialog stays open while saving, and asks before changes are thrown away. */
	export function canClose(): boolean {
		if (saving) return false;
		if (picture === undefined && !preparingPicture && sameForm(values, opened)) return true;
		return confirm('Discard your changes?');
	}

	const inputClass = 'input placeholder:text-surface-400-600 px-3 py-2 text-base';
</script>

{#snippet fieldError(field: FormField)}
	{#if errors[field]}
		<p id={id(`${field}-error`)} class="text-error-700-300 text-sm font-semibold">
			{errors[field]}
		</p>
	{/if}
{/snippet}

<form class="flex min-h-0 flex-1 flex-col" novalidate onsubmit={save} data-icon-form>
	<header class="border-surface-200-800 shrink-0 border-b px-6 py-3">
		<Dialog.Title class="h4 truncate">{title}</Dialog.Title>
	</header>

	<div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-3">
		{#if pictureNeeded}
			<p class="card preset-tonal-warning px-3 py-2 text-sm">
				To offer {original?.name ?? 'this icon'} to guests, it needs a picture: guest buttons show it.
				Choose one, then save.
			</p>
		{/if}
		<div class="flex flex-col gap-5 md:flex-row">
			<div data-picture class="contents">
				<PicturePicker
					field="image"
					currentUrl={currentPictureUrl}
					bind:change={picture}
					bind:preparing={preparingPicture}
					disabled={saving}
					error={errors.image}
					onError={(text) => {
						if (text) errors.image = text;
						else clearError('image');
					}}
					label={values.for_guests ? 'Picture (needed for guests)' : 'Picture'}
					emptyHint="No picture: the previews show what the slides use instead. Or drop a picture here."
					removedHint="The picture is removed when you save; the slides then use what the previews show."
					note="Square pictures look best."
					maxSide={SMALL_PICTURE_SIDE}
					class="md:w-60"
				>
					{#snippet preview(url)}
						<IconPreview {url} name={values.name} />
					{/snippet}
				</PicturePicker>
			</div>

			<div class="min-w-0 flex-1 space-y-4">
				<div class="space-y-1">
					<label class="label" for={id('name')}>
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
							aria-describedby="{id('name-hint')}{errors.name ? ` ${id('name-error')}` : ''}"
						/>
					</label>
					<!-- The name is only a label: a guest or a day keeps its own name. -->
					<p id={id('name-hint')} class="text-sm opacity-80">
						A label for finding this icon: the guest check-in list and the Calendar's icon picker
						show it. It isn't used as a guest's or a day's name.
					</p>
					{@render fieldError('name')}
				</div>

				<div class="space-y-2">
					<div class="flex items-start gap-3">
						<label class="label w-24 shrink-0" for={id('emoji')}>
							<span class="label-text">Emoji <span class="text-error-600-400">*</span></span>
							<input
								id={id('emoji')}
								class="input h-14 px-2 py-1 text-center text-3xl"
								autocomplete="off"
								spellcheck="false"
								aria-required="true"
								value={values.emoji}
								oninput={(event) => setText('emoji', event.currentTarget.value)}
								aria-invalid={!!errors.emoji}
								aria-describedby="{id('emoji-hint')}{errors.emoji ? ` ${id('emoji-error')}` : ''}"
							/>
						</label>
						<p id={id('emoji-hint')} class="min-w-0 flex-1 pt-6 text-sm opacity-80">
							{#if oddSavedEmoji}
								The saved emoji <span class="break-all">{initial.emoji.trim()}</span> is more than one
								character; it is kept as it is unless you change it.
							{:else}
								One emoji, shown next to the name when guests check in. Type or paste one, pick one
								below, or open your computer's emoji picker: <kbd class="kbd">Win</kbd> +
								<kbd class="kbd">.</kbd> on Windows, <kbd class="kbd">Ctrl</kbd> +
								<kbd class="kbd">Cmd</kbd> + <kbd class="kbd">Space</kbd> on a Mac.
							{/if}
						</p>
					</div>
					{@render fieldError('emoji')}
					<EmojiPalette
						value={values.emoji}
						disabled={saving}
						onPick={(emoji) => setText('emoji', emoji)}
					/>
				</div>

				<fieldset class="grid gap-x-4 gap-y-2 sm:grid-cols-2">
					<legend class="label-text mb-1">Use it for</legend>
					{#each USES as use (use.key)}
						<div>
							<LabeledSwitch
								label={use.label}
								name={use.field}
								checked={values[use.field]}
								describedBy={id(`${use.key}-help`)}
								onCheckedChange={(checked) => {
									values[use.field] = checked;
									if (use.field === 'for_guests' && !checked) clearError('image');
								}}
								class="-ml-2"
							/>
							<p id={id(`${use.key}-help`)} class="text-sm opacity-80">{use.help}</p>
						</div>
					{/each}
				</fieldset>
			</div>
		</div>
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
					{original ? 'Save changes' : 'Add icon'}
				{/if}
			</button>
		</div>
	</footer>
</form>
