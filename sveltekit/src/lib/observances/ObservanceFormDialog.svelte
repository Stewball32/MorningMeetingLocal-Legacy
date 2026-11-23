<script lang="ts">
	import EditorDialog from '#lib/editor/EditorDialog.svelte';
	import type { SaveOutcome } from '#lib/editor/form.ts';
	import type { BuiltInHoliday } from '#lib/pb/calendar.ts';
	import type { CalendarObservance, IconRecord } from '#lib/pb/types.ts';
	import type { FormPreset } from './form.ts';
	import ObservanceForm from './ObservanceForm.svelte';

	interface Props {
		open: boolean;
		/** A new value for every opening (see EditorDialog). */
		session: number;
		/** The record to edit, or null to add one. */
		record: CalendarObservance | null;
		preset?: FormPreset;
		records: readonly CalendarObservance[];
		icons: readonly IconRecord[];
		iconsStatus: 'loading' | 'ready' | 'error';
		holidays: readonly BuiltInHoliday[];
		today: Date;
		onSaved: (record: CalendarObservance, outcome: Exclude<SaveOutcome, 'unchanged'>) => void;
		/** Nothing to save (see ObservanceForm). */
		onUnchanged: (name: string) => void;
		onClose: () => void;
		onEditOther: (record: CalendarObservance) => void;
		finalFocusEl?: () => HTMLElement | null;
	}

	let {
		open,
		session,
		record,
		preset = {},
		records,
		icons,
		iconsStatus,
		holidays,
		today,
		onSaved,
		onUnchanged,
		onClose,
		onEditOther,
		finalFocusEl
	}: Props = $props();

	let form: ReturnType<typeof ObservanceForm> | undefined = $state();
</script>

<EditorDialog
	{open}
	{session}
	{onClose}
	canClose={() => form?.canClose() ?? true}
	closeOnInteractOutside={false}
	initialFocusEl={() =>
		document.querySelector<HTMLElement>('[data-observance-form] [data-initial-focus]')}
	{finalFocusEl}
	class="max-w-3xl"
>
	<ObservanceForm
		bind:this={form}
		{record}
		{preset}
		{records}
		{icons}
		{iconsStatus}
		{holidays}
		{today}
		{onSaved}
		{onUnchanged}
		onCancel={onClose}
		{onEditOther}
	/>
</EditorDialog>
