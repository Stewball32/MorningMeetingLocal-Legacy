<script lang="ts">
	import type { Person } from '#lib/pb/types.ts';
	import EditorDialog from './EditorDialog.svelte';
	import type { PersonFormValues, SaveOutcome } from './form.ts';
	import PersonForm from './PersonForm.svelte';

	interface Props {
		open: boolean;
		/** A new value for every opening (see EditorDialog). */
		session: number;
		/** The person to edit, or null to add someone new. */
		person: Person | null;
		preset?: Partial<PersonFormValues>;
		onSaved: (person: Person, outcome: SaveOutcome) => void;
		onClose: () => void;
		finalFocusEl?: () => HTMLElement | null;
	}

	let { open, session, person, preset = {}, onSaved, onClose, finalFocusEl }: Props = $props();

	let form: ReturnType<typeof PersonForm> | undefined = $state();
</script>

<EditorDialog
	{open}
	{session}
	{onClose}
	canClose={() => form?.canClose() ?? true}
	closeOnInteractOutside={false}
	initialFocusEl={() =>
		document.querySelector<HTMLElement>('[data-person-form] [data-initial-focus]')}
	{finalFocusEl}
	class="max-w-3xl"
>
	<PersonForm bind:this={form} {person} {preset} {onSaved} onCancel={onClose} />
</EditorDialog>
