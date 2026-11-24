<!--
	@component
	Choosing an icon (from the Icons page) as an observance's picture: the icons with "Calendar"
	on, and "Show all icons" for the rest. Radio buttons, so the arrow keys move between them.
-->
<script lang="ts">
	import ImageOff from '@lucide/svelte/icons/image-off';
	import { untrack } from 'svelte';
	import { iconPictureUrl } from '#lib/pb/observances.ts';
	import type { IconRecord } from '#lib/pb/types.ts';

	interface Props {
		/** Every icon (the page's live list). */
		icons: readonly IconRecord[];
		/** The chosen icon's id ('' for none). */
		value: string;
		onChange: (id: string) => void;
		/** The icons couldn't be loaded (yet). */
		status?: 'loading' | 'ready' | 'error';
		disabled?: boolean;
		error?: string;
		/** id for the message, for aria-describedby. */
		errorId?: string;
	}

	let {
		icons,
		value,
		onChange,
		status = 'ready',
		disabled = false,
		error,
		errorId
	}: Props = $props();

	const calendarIcons = $derived(icons.filter((icon) => icon.for_calendar));
	const others = $derived(icons.filter((icon) => !icon.for_calendar));
	// Start with every icon shown when the chosen one isn't a calendar icon.
	let showAll = $state(untrack(() => !!value && !icons.find((i) => i.id === value)?.for_calendar));
	const shown = $derived(
		showAll ? [...calendarIcons, ...others] : icons.filter((i) => i.for_calendar || i.id === value)
	);
	const chosen = $derived(icons.find((icon) => icon.id === value));
	const missing = $derived(!!value && status === 'ready' && !chosen);

	const name = $props.id();
</script>

<div class="space-y-2" data-icon-choice>
	{#if status === 'loading'}
		<p class="text-sm opacity-80">Loading the icons…</p>
	{:else if status === 'error'}
		<p class="text-sm opacity-80">
			Couldn't load the icons just now; they show up here as soon as PocketBase answers.
		</p>
	{:else if icons.length === 0}
		<p class="text-sm opacity-80">
			There are no icons yet. Add pictures on the Icons page (from Home) and turn on Calendar.
		</p>
	{:else}
		{#if calendarIcons.length === 0 && !showAll}
			<p class="text-sm opacity-80">
				No icon has Calendar turned on yet (on the Icons page). You can still use any icon:
			</p>
		{/if}
		{#if missing}
			<p class="text-error-700-300 text-sm font-semibold">
				The icon it used is gone (deleted on the Icons page). Choose another one.
			</p>
		{/if}
		<div
			role="radiogroup"
			aria-label="Icons"
			aria-describedby={error ? errorId : undefined}
			class="border-surface-200-800 rounded-base grid max-h-80 grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 overflow-y-auto border p-1"
		>
			{#each shown as icon (icon.id)}
				{@const url = iconPictureUrl(icon, '100x100')}
				<label
					class="rounded-base hover:preset-tonal-primary has-checked:preset-tonal-primary has-checked:ring-primary-500 has-focus-visible:ring-primary-500 flex cursor-pointer flex-col items-center gap-1 p-2 text-center ring-2 ring-transparent has-focus-visible:ring-4"
					data-icon={icon.id}
				>
					<input
						type="radio"
						class="sr-only"
						{name}
						value={icon.id}
						checked={icon.id === value}
						{disabled}
						onchange={() => onChange(icon.id)}
					/>
					{#if url}
						<img
							src={url}
							alt=""
							class="bg-surface-100-900 size-16 rounded-sm object-contain"
							loading="lazy"
							draggable={false}
						/>
					{:else}
						<span
							class="bg-surface-100-900 flex size-16 items-center justify-center rounded-sm"
							aria-hidden="true"
						>
							<ImageOff class="size-8 opacity-50" />
						</span>
					{/if}
					<span class="line-clamp-2 text-sm leading-tight break-words">{icon.name}</span>
					{#if !url}
						<span class="text-xs opacity-80">No picture</span>
					{/if}
				</label>
			{/each}
		</div>
		{#if chosen && !chosen.image}
			<p class="text-sm opacity-80">
				{chosen.name} has no picture yet, so the calendar shows its default picture until it gets one
				(on the Icons page).
			</p>
		{/if}
		{#if others.length > 0}
			<button
				type="button"
				class="btn preset-tonal px-3 py-1.5 text-sm"
				aria-expanded={showAll}
				{disabled}
				onclick={() => (showAll = !showAll)}
			>
				{showAll
					? 'Only icons for the calendar'
					: `Show all icons (${others.length} more, e.g. guest pictures)`}
			</button>
		{/if}
	{/if}
	{#if error}
		<p id={errorId} class="text-error-700-300 text-sm font-semibold">{error}</p>
	{/if}
</div>
