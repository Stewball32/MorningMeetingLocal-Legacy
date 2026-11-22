<!--
	@component
	The picture part of an Add / Edit form: a preview, "Choose / Replace picture", "Remove picture",
	"Keep the old picture", and dropping a file onto it. Each chosen picture is checked and big
	photos are scaled down (preparePicture in picture.ts); only the latest choice counts.

	The form reads two bindable values: `change` (what to send: a File to upload, null to remove
	the saved picture, undefined to keep it; see withFile in #lib/pb/requests.ts) and `preparing`
	(a picture is being got ready: Save must wait). The form keeps the error message (so it can
	also show PocketBase's error for the field) and gets told through `onError`.

	```svelte
	<PicturePicker field="image" currentUrl={original ? recordFileUrl(original, original.image) : ''}
		bind:change={picture} bind:preparing={preparingPicture} disabled={saving}
		error={errors.image} onError={(text) => (errors.image = text)}>
		{#snippet preview(url)}<Picture src={url} fallback="/defaults/default.png" class="size-32" />{/snippet}
	</PicturePicker>
	```
-->
<script lang="ts">
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import ImageOff from '@lucide/svelte/icons/image-off';
	import Undo from '@lucide/svelte/icons/undo-2';
	import { onDestroy, type Snippet } from 'svelte';
	import type { FileChange } from '#lib/pb/requests.ts';
	import { PICTURE_ACCEPT, preparePicture } from './picture.ts';

	interface Props {
		/** The record's file field (e.g. "avatar"); names the error's id (`…-avatar-error`). */
		field: string;
		/** The saved picture's URL; '' when there is none (or when adding a record). */
		currentUrl: string;
		/** What to send for the field when saving. Bindable; starts as undefined (keep). */
		change?: FileChange;
		/** A chosen picture is being got ready. Bindable. */
		preparing?: boolean;
		/** Saving: no more choices. */
		disabled?: boolean;
		/** The message under the picture (the form's error for `field`). */
		error?: string;
		/** A choice failed (`text`), or the picture changed and an old message no longer applies. */
		onError: (text: string | undefined) => void;
		/** Draws the preview for a URL ('' when there is no picture). */
		preview: Snippet<[url: string]>;
		label?: string;
		/** Under the preview with no picture, e.g. what the slides show instead. */
		emptyHint?: string;
		/** Under the preview once Remove picture was pressed. */
		removedHint?: string;
		/** An extra line under the hint, e.g. "Square pictures look best." */
		note?: string;
		/**
		 * Still pictures are scaled down to at most this many pixels wide and high, for pictures only
		 * ever shown small (SMALL_PICTURE_SIDE in picture.ts). By default only very big ones are.
		 */
		maxSide?: number;
		/** Width of the column, e.g. "md:w-52". */
		class?: string;
	}

	let {
		field,
		currentUrl,
		change = $bindable(),
		preparing = $bindable(false),
		disabled = false,
		error,
		onError,
		preview,
		label = 'Picture',
		emptyHint = 'No picture: the slides show this default one. Or drop a picture here.',
		removedHint = 'The picture is removed when you save; the slides then show the default one.',
		note,
		maxSide,
		class: className = ''
	}: Props = $props();

	let newPicture: File | null = $state(null);
	let newPictureUrl = $state('');
	let removePicture = $state(false);
	let dragging = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	const pictureUrl = $derived(newPictureUrl || (removePicture ? '' : currentUrl));

	const forgetNewPicture = () => {
		if (newPictureUrl) URL.revokeObjectURL(newPictureUrl);
		newPicture = null;
		newPictureUrl = '';
	};
	/**
	 * Counts picture choices. Getting a big one ready takes a moment; only the latest choice's
	 * result is used, so a slow one can't replace a picture chosen after it.
	 */
	let pictureChoice = 0;
	const dropPictureInProgress = () => {
		pictureChoice++;
		preparing = false;
	};
	onDestroy(() => {
		pictureChoice++;
		if (newPictureUrl) URL.revokeObjectURL(newPictureUrl);
	});

	async function usePicture(file: File | null | undefined) {
		if (!file || disabled) return;
		onError(undefined);
		const choice = ++pictureChoice;
		preparing = true;
		const result = await preparePicture(file, { maxSide }).catch((reason: unknown) => {
			console.error('Could not read the picture', reason);
			return { error: "Couldn't read that picture. Please choose it again." };
		});
		if (choice !== pictureChoice) return;
		preparing = false;
		if ('error' in result) {
			onError(result.error);
			return;
		}
		forgetNewPicture();
		newPicture = result.file;
		newPictureUrl = URL.createObjectURL(result.file);
		removePicture = false;
		change = result.file;
	}

	function onFileChosen(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = ''; // so choosing the same file again still counts
		usePicture(file);
	}

	function onRemovePicture() {
		dropPictureInProgress();
		forgetNewPicture();
		removePicture = !!currentUrl;
		change = removePicture ? null : undefined;
		onError(undefined);
	}

	function onKeepPicture() {
		dropPictureInProgress();
		forgetNewPicture();
		removePicture = false;
		change = undefined;
		onError(undefined);
	}

	const isFileDrag = (event: DragEvent) => !!event.dataTransfer?.types.includes('Files');

	const idPrefix = $props.id();
	const id = (part: string) => `${idPrefix}-${part}`;
</script>

<div
	role="group"
	aria-labelledby={id('picture-label')}
	class="rounded-container flex shrink-0 flex-col items-center gap-2 p-2 {className} {dragging
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
	<span id={id('picture-label')} class="label-text self-start">{label}</span>
	{@render preview(pictureUrl)}
	<input
		bind:this={fileInput}
		type="file"
		accept={PICTURE_ACCEPT}
		class="hidden"
		onchange={onFileChosen}
		aria-hidden="true"
		tabindex="-1"
	/>
	<div class="flex flex-wrap justify-center gap-2">
		<button
			type="button"
			class="btn preset-tonal-primary px-3 py-2"
			disabled={preparing || disabled}
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
				disabled={preparing || disabled}
				onclick={onRemovePicture}
			>
				<ImageOff class="size-5" aria-hidden="true" />
				Remove picture
			</button>
		{/if}
		{#if change !== undefined && currentUrl}
			<button type="button" class="btn preset-tonal px-3 py-2" {disabled} onclick={onKeepPicture}>
				<Undo class="size-5" aria-hidden="true" />
				Keep the old picture
			</button>
		{/if}
	</div>
	<p id={id('picture-status')} class="text-center text-xs opacity-80" aria-live="polite">
		{#if preparing}
			Getting the picture ready…
		{:else if newPicture}
			New picture chosen; it is uploaded when you save.
		{:else if removePicture}
			{removedHint}
		{:else if pictureUrl}
			Or drop a new picture here.
		{:else}
			{emptyHint}
		{/if}
	</p>
	{#if note}
		<p class="text-center text-xs opacity-80">{note}</p>
	{/if}
	{#if error}
		<p id={id(`${field}-error`)} class="text-error-700-300 text-sm font-semibold">
			{error}
		</p>
	{/if}
</div>
