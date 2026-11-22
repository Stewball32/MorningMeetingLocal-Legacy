<script lang="ts">
	import type { Person } from '#lib/pb/types.ts';
	import type { PersonHistory } from '#lib/pb/people.ts';
	import DeletePersonConfirm from './DeletePersonConfirm.svelte';
	import EditorDialog from './EditorDialog.svelte';

	interface Props {
		open: boolean;
		/** Who to delete; keep it set while the dialog closes so it doesn't empty mid-animation. */
		person: Person | null;
		onClose: () => void;
		/** `history`: what was deleted with them (null if it couldn't be counted). */
		onDeleted: (person: Person, history: PersonHistory | null, alreadyGone: boolean) => void;
		onDeactivate: (person: Person) => void;
	}

	let { open, person, onClose, onDeleted, onDeactivate }: Props = $props();
</script>

<!-- An alert dialog: zag focuses Cancel (the Dialog.CloseTrigger) first and ignores outside clicks. -->
<EditorDialog {open} {onClose} role="alertdialog" class="max-w-xl">
	{#if person}
		<DeletePersonConfirm {person} {onDeleted} {onDeactivate} />
	{/if}
</EditorDialog>
