<!--
	@component
	The delete confirmation of the Calendar Observances page, for three cases:
	- `record`: one of the class's own observances (or a record the calendar ignores); "Turn off
	  instead" keeps it for later;
	- `reset`: a built-in holiday's changes (all its settings records), so it shows as it comes;
	- `past`: every one-time observance whose days have all passed (cleaning up).
	Records already deleted in another window count as done.
-->
<script lang="ts" module>
	import type { BuiltInHoliday } from '#lib/pb/calendar.ts';
	import type { CalendarObservance } from '#lib/pb/types.ts';

	export type DeleteTarget =
		| { kind: 'record'; record: CalendarObservance; picture: string }
		| {
				kind: 'reset';
				holiday: BuiltInHoliday;
				/** Every settings record for the holiday. */
				records: CalendarObservance[];
				picture: string;
		  }
		| { kind: 'past'; records: CalendarObservance[] };
</script>

<script lang="ts">
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import DeleteConfirm from '#lib/editor/DeleteConfirm.svelte';
	import EditorDialog from '#lib/editor/EditorDialog.svelte';
	import { isPbError } from '#lib/editor/errors.ts';
	import { plural } from '#lib/editor/list.ts';
	import { deleteObservance } from '#lib/pb/observances.ts';
	import ObservancePicture from './ObservancePicture.svelte';
	import { OBSERVANCE_ERRORS, SCHOOL_LABEL } from './observances.ts';

	interface Props {
		open: boolean;
		/** A new value for every opening (see EditorDialog). */
		session: number;
		/** Keep it set while the dialog closes so it doesn't empty mid-animation. */
		target: DeleteTarget | null;
		onClose: () => void;
		/** `deleted`: the records that are gone now (or were already). */
		onDeleted: (target: DeleteTarget, alreadyGone: boolean) => void;
		/** "Turn off instead" for one record. */
		onTurnOff: (record: CalendarObservance) => void;
		finalFocusEl?: () => HTMLElement | null;
	}

	let { open, session, target, onClose, onDeleted, onTurnOff, finalFocusEl }: Props = $props();

	let confirm: ReturnType<typeof DeleteConfirm<null>> | undefined = $state();

	const nameOf = (record: CalendarObservance) => record.name?.trim() || '(no name)';

	/** Deletes them all; one already gone counts as done. */
	async function removeAll(records: CalendarObservance[]) {
		const results = await Promise.allSettled(records.map((record) => deleteObservance(record.id)));
		const failed = results.find(
			(result): result is PromiseRejectedResult =>
				result.status === 'rejected' && !(isPbError(result.reason) && result.reason.status === 404)
		);
		if (failed) throw failed.reason;
	}

	const title = $derived(
		!target
			? ''
			: target.kind === 'record'
				? `Delete ${nameOf(target.record)}?`
				: target.kind === 'reset'
					? `Undo your changes to ${target.holiday.name}?`
					: `Delete ${plural(target.records.length, 'past observance')}?`
	);
	const doing = $derived(
		!target
			? ''
			: target.kind === 'record'
				? `delete ${nameOf(target.record)}`
				: target.kind === 'reset'
					? `undo the changes to ${target.holiday.name}`
					: 'delete the past observances'
	);
</script>

<!-- An alert dialog: zag focuses Cancel (the Dialog.CloseTrigger) first and ignores outside clicks. -->
<EditorDialog
	{open}
	{session}
	{onClose}
	canClose={() => confirm?.canClose() ?? true}
	{finalFocusEl}
	role="alertdialog"
	class="max-w-xl"
>
	{#if target}
		<DeleteConfirm
			bind:this={confirm}
			{title}
			remove={() =>
				target.kind === 'record' ? deleteObservance(target.record.id) : removeAll(target.records)}
			{doing}
			errorOptions={OBSERVANCE_ERRORS}
			deleteLabel={target.kind === 'reset'
				? 'Undo my changes'
				: target.kind === 'past'
					? `Delete ${plural(target.records.length, 'observance')}`
					: 'Delete permanently'}
			deleteClass={target.kind === 'record' && target.record.is_active
				? 'preset-tonal-error'
				: 'preset-filled-error-500'}
			onDeleted={(_, alreadyGone) => onDeleted(target, alreadyGone)}
		>
			{#snippet picture()}
				{#if target.kind !== 'past'}
					<ObservancePicture src={target.picture} class="size-16" />
				{/if}
			{/snippet}

			{#snippet description()}
				{#if target.kind === 'record'}
					<p>
						This permanently deletes {nameOf(target.record)}{target.record.image
							? ' and its picture'
							: ''}. Its days are no longer on the calendar.
					</p>
					<p>This can't be undone.</p>
				{:else if target.kind === 'reset'}
					<p>
						The calendar shows {target.holiday.name} as it comes again: the default picture and its own
						school day ({SCHOOL_LABEL[target.holiday.school]}){target.records.some((r) => r.hidden)
							? ', and it is no longer hidden'
							: ''}. Your notes for it are deleted too.
					</p>
				{:else}
					<p>All their days have passed, so the calendar no longer shows them:</p>
					<ul class="list-inside list-disc">
						{#each target.records.slice(0, 8) as record (record.id)}
							<li>{nameOf(record)}</li>
						{/each}
						{#if target.records.length > 8}
							<li>and {target.records.length - 8} more</li>
						{/if}
					</ul>
					<p>This can't be undone.</p>
				{/if}
			{/snippet}

			{#snippet alternative(busy)}
				{#if target.kind === 'record' && target.record.is_active}
					<div class="card preset-tonal-warning space-y-3 p-4">
						<p>
							<strong class="font-semibold">Need it again later (e.g. next year)?</strong>
							Turn off “Show on the calendar” instead: it disappears from the calendar and stays here.
						</p>
						<button
							type="button"
							class="btn preset-filled-warning-500 px-4 py-2"
							disabled={busy}
							onclick={() => target.kind === 'record' && onTurnOff(target.record)}
						>
							<EyeOff class="size-5" aria-hidden="true" />
							Turn off instead
						</button>
					</div>
				{/if}
			{/snippet}
		</DeleteConfirm>
	{/if}
</EditorDialog>
