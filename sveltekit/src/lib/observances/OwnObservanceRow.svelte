<!--
	@component
	One of the class's own observances in the list (also used for records the calendar ignores):
	its picture, name, days, school day, a "Show on the calendar" switch, Edit and Delete.
-->
<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash from '@lucide/svelte/icons/trash-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import LabeledSwitch from '#lib/editor/LabeledSwitch.svelte';
	import type { School } from '#lib/pb/calendar.ts';
	import type { CalendarObservance } from '#lib/pb/types.ts';
	import ObservancePicture from './ObservancePicture.svelte';
	import SchoolBadge from './SchoolBadge.svelte';

	interface Props {
		record: CalendarObservance;
		/** The picture the slide shows ('' for the default). */
		picture: string;
		/** Its days, in words. */
		schedule: string;
		/** e.g. "Next: Tomorrow" */
		next?: string;
		school: School;
		/** Something to fix (shown with a warning sign). */
		warning?: string;
		/** The switch's label (it changes `is_active`); no switch without it. */
		switchLabel?: string;
		/** The switch's change is being saved. */
		busy?: boolean;
		onToggle: (value: boolean) => void;
		onEdit: () => void;
		onDelete: () => void;
	}

	let {
		record,
		picture,
		schedule,
		next = '',
		school,
		warning = '',
		switchLabel,
		busy = false,
		onToggle,
		onEdit,
		onDelete
	}: Props = $props();

	const name = $derived(record.name?.trim() || '(no name)');
	const tag = 'rounded-full px-2.5 py-0.5 text-sm';
</script>

<li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3" data-observance={record.id}>
	<ObservancePicture
		src={picture}
		class="size-16 {record.is_active ? '' : 'opacity-60 grayscale'}"
	/>
	<div class="min-w-40 flex-1">
		<p class="truncate text-xl font-semibold" title={name}>{name}</p>
		<p class="text-sm">{schedule}</p>
		<p class="mt-1 flex flex-wrap items-center gap-1.5">
			<SchoolBadge {school} showRegular />
			{#if next}
				<span class="{tag} preset-tonal">{next}</span>
			{/if}
			{#if !record.is_active}
				<span class="{tag} preset-tonal opacity-80">not on the calendar</span>
			{/if}
		</p>
		{#if warning}
			<p class="mt-1 flex items-start gap-1.5 text-sm">
				<TriangleAlert class="text-warning-700-300 mt-0.5 size-4 shrink-0" aria-hidden="true" />
				<span>{warning}</span>
			</p>
		{/if}
	</div>
	{#if switchLabel}
		<LabeledSwitch
			label={switchLabel}
			context={name}
			checked={record.is_active}
			readOnly={busy}
			onCheckedChange={onToggle}
		/>
	{/if}
	<div class="flex items-center gap-2">
		<!-- The space is in the expression: Svelte drops one at the start of an element. -->
		<button type="button" class="btn preset-tonal-primary px-4 py-2" data-edit onclick={onEdit}>
			<Pencil class="size-5" aria-hidden="true" />
			Edit<span class="sr-only">{` ${name}`}</span>
		</button>
		<button type="button" class="btn preset-tonal-error px-4 py-2" onclick={onDelete}>
			<Trash class="size-5" aria-hidden="true" />
			Delete<span class="sr-only">{` ${name}`}</span>
		</button>
	</div>
</li>
