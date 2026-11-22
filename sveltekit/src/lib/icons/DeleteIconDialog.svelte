<script lang="ts">
	import EditorDialog from '#lib/editor/EditorDialog.svelte';
	import type { IconRecord } from '#lib/pb/types.ts';
	import DeleteIconConfirm from './DeleteIconConfirm.svelte';
	import type { UseCounts } from './uses.ts';

	interface Props {
		open: boolean;
		/** A new value for every opening (see EditorDialog). */
		session: number;
		/** The icon to delete; keep it set while the dialog closes so it doesn't empty mid-animation. */
		icon: IconRecord | null;
		onClose: () => void;
		/** `uses`: what used it (null if that couldn't be counted). */
		onDeleted: (icon: IconRecord, uses: UseCounts | null, alreadyGone: boolean) => void;
		onTurnOff: (icon: IconRecord) => void;
		finalFocusEl?: () => HTMLElement | null;
	}

	let { open, session, icon, onClose, onDeleted, onTurnOff, finalFocusEl }: Props = $props();

	let confirmation: ReturnType<typeof DeleteIconConfirm> | undefined = $state();
</script>

<!-- An alert dialog: zag focuses Cancel (the Dialog.CloseTrigger) first and ignores outside clicks. -->
<EditorDialog
	{open}
	{session}
	{onClose}
	canClose={() => confirmation?.canClose() ?? true}
	{finalFocusEl}
	role="alertdialog"
	class="max-w-xl"
>
	{#if icon}
		<DeleteIconConfirm bind:this={confirmation} {icon} {onDeleted} {onTurnOff} />
	{/if}
</EditorDialog>
