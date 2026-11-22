<script lang="ts">
	import type { Person } from '#lib/pb/types.ts';
	import type { PersonHistory } from '#lib/pb/people.ts';
	import DeletePersonConfirm from './DeletePersonConfirm.svelte';
	import EditorDialog from './EditorDialog.svelte';

	interface Props {
		open: boolean;
		/** A new value for every opening (see EditorDialog). */
		session: number;
		/** Who to delete; keep it set while the dialog closes so it doesn't empty mid-animation. */
		person: Person | null;
		onClose: () => void;
		/** `history`: what was deleted with them (null if it couldn't be counted). */
		onDeleted: (person: Person, history: PersonHistory | null, alreadyGone: boolean) => void;
		onDeactivate: (person: Person) => void;
		finalFocusEl?: () => HTMLElement | null;
	}

	let { open, session, person, onClose, onDeleted, onDeactivate, finalFocusEl }: Props = $props();

	let confirmation: ReturnType<typeof DeletePersonConfirm> | undefined = $state();
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
	{#if person}
		<DeletePersonConfirm bind:this={confirmation} {person} {onDeleted} {onDeactivate} />
	{/if}
</EditorDialog>
