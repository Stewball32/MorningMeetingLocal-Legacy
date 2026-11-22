<!--
	@component
	A built-in holiday in the list: its day this school year (and its observed weekday), its
	school day and what has been changed, with Customize, Hide / Show and Reset.
-->
<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import Pencil from '@lucide/svelte/icons/pencil';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import { formatDay, startOfDay } from './dates.ts';
	import ObservancePicture from './ObservancePicture.svelte';
	import type { BuiltInRow } from './observances.ts';
	import SchoolBadge from './SchoolBadge.svelte';

	interface Props {
		row: BuiltInRow;
		today: Date;
		/** Hide / Show is being saved. */
		busy?: boolean;
		onCustomize: () => void;
		onHide: (hidden: boolean) => void;
		onReset: () => void;
	}

	let { row, today, busy = false, onCustomize, onHide, onReset }: Props = $props();

	const name = $derived(row.holiday.name);
	const passed = $derived(!!row.date && row.date < startOfDay(today));
	/** What the class changed, in words. */
	const changes = $derived(
		[
			row.picture && 'picture',
			row.school !== row.holiday.school && 'school day',
			row.description && 'notes'
		].filter(Boolean)
	);
	const off = $derived(
		!!row.record && !row.record.is_active && row.extra.every((r) => !r.is_active)
	);
	const tag = 'rounded-full px-2.5 py-0.5 text-sm';
</script>

<li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3" data-builtin={row.key}>
	<ObservancePicture
		src={row.picture}
		class="size-16 {row.hidden ? 'opacity-40 grayscale' : passed ? 'opacity-70' : ''}"
	/>
	<div class="min-w-40 flex-1">
		<p class="truncate text-xl font-semibold" title={name}>{name}</p>
		<p class="text-sm">
			{#if row.date}
				<span class={passed ? 'opacity-70' : ''}>{formatDay(row.date)}</span>
				{#if passed}<span class="opacity-70">(passed)</span>{/if}
				{#if row.observed}
					· <span class="whitespace-nowrap">observed {formatDay(row.observed, false)}</span>
				{/if}
			{:else}
				<span class="opacity-80">
					Not this school year{row.next ? ` (next: ${formatDay(row.next)})` : ''}
				</span>
			{/if}
		</p>
		<p class="mt-1 flex flex-wrap items-center gap-1.5">
			{#if row.hidden}
				<span class="{tag} preset-tonal-warning inline-flex items-center gap-1">
					<EyeOff class="size-4" aria-hidden="true" /> hidden
				</span>
			{:else}
				<SchoolBadge school={row.school} showRegular />
			{/if}
			{#if changes.length > 0 && !off}
				<span class="{tag} preset-tonal-primary">changed: {changes.join(', ')}</span>
			{/if}
			{#if off}
				<span class="{tag} preset-tonal opacity-80">your changes are off</span>
			{/if}
		</p>
		{#if row.description && !off}
			<p class="mt-1 line-clamp-2 text-sm opacity-80">Notes: {row.description}</p>
		{/if}
	</div>
	<div class="flex flex-wrap items-center gap-2">
		<button
			type="button"
			class="btn preset-tonal-primary px-4 py-2"
			data-customize
			onclick={onCustomize}
		>
			<Pencil class="size-5" aria-hidden="true" />
			Customize<span class="sr-only">{` ${name}`}</span>
		</button>
		<button
			type="button"
			class="btn preset-tonal px-4 py-2"
			disabled={busy}
			data-hide
			onclick={() => onHide(!row.hidden)}
		>
			{#if row.hidden}
				<Eye class="size-5" aria-hidden="true" />
				Show<span class="sr-only">{` ${name}`}</span>
			{:else}
				<EyeOff class="size-5" aria-hidden="true" />
				Hide<span class="sr-only">{` ${name}`}</span>
			{/if}
		</button>
		{#if row.record}
			<button type="button" class="btn preset-tonal-error px-4 py-2" onclick={onReset}>
				<RotateCcw class="size-5" aria-hidden="true" />
				Reset<span class="sr-only">{` ${name}`}</span>
			</button>
		{/if}
	</div>
</li>
