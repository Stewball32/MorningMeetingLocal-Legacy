<script lang="ts">
	import type { Person } from '#lib/pb/types.ts';
	import EditorDialog from './EditorDialog.svelte';
	import type { PersonFormValues } from './form.ts';
	import PersonForm from './PersonForm.svelte';

	interface Props {
		open: boolean;
		/** The person to edit, or null to add someone new. */
		person: Person | null;
		preset?: Partial<PersonFormValues>;
		onSaved: (person: Person, created: boolean) => void;
		onClose: () => void;
	}

	let { open, person, preset = {}, onSaved, onClose }: Props = $props();
</script>

<EditorDialog
	{open}
	{onClose}
	closeOnInteractOutside={false}
	initialFocusEl={() =>
		document.querySelector<HTMLElement>('[data-person-form] [data-initial-focus]')}
	class="max-w-3xl"
>
	<PersonForm {person} {preset} {onSaved} onCancel={onClose} />
</EditorDialog>
