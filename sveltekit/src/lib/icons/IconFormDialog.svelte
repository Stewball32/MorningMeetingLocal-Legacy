<script lang="ts">
	import EditorDialog from '#lib/editor/EditorDialog.svelte';
	import type { SaveOutcome } from '#lib/editor/form.ts';
	import type { IconRecord } from '#lib/pb/types.ts';
	import type { IconFormValues } from './form.ts';
	import IconForm from './IconForm.svelte';

	interface Props {
		open: boolean;
		/** A new value for every opening (see EditorDialog). */
		session: number;
		/** The icon to edit, or null to add a new one. */
		icon: IconRecord | null;
		/** Every icon (the page's live list), for the check that names are not taken. */
		icons: readonly IconRecord[];
		preset?: Partial<IconFormValues>;
		/** Opened because Guests was turned on for an icon without a picture. */
		pictureNeeded?: boolean;
		onSaved: (icon: IconRecord, outcome: SaveOutcome) => void;
		onClose: () => void;
		finalFocusEl?: () => HTMLElement | null;
	}

	let {
		open,
		session,
		icon,
		icons,
		preset = {},
		pictureNeeded = false,
		onSaved,
		onClose,
		finalFocusEl
	}: Props = $props();

	let form: ReturnType<typeof IconForm> | undefined = $state();
</script>

<EditorDialog
	{open}
	{session}
	{onClose}
	canClose={() => form?.canClose() ?? true}
	closeOnInteractOutside={false}
	initialFocusEl={() =>
		document.querySelector<HTMLElement>(
			pictureNeeded
				? '[data-icon-form] [data-picture] button'
				: '[data-icon-form] [data-initial-focus]'
		)}
	{finalFocusEl}
	class="max-w-3xl"
>
	<IconForm bind:this={form} {icon} {icons} {preset} {pictureNeeded} {onSaved} onCancel={onClose} />
</EditorDialog>
