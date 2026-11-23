<!--
	@component
	One group of an editor's list (e.g. "Teachers", "For guests"): a card with the title, a count,
	a description, an optional Add button, and the rows, or `empty` when there are none.

	The rows (`children`) go in a `<ul>`: render `<li>` elements. The card has `data-group={key}`,
	which FocusReturn uses to find the Add button when a dialog closes.
-->
<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import type { Snippet } from 'svelte';

	interface Props {
		/** Identifies the group (data-group, and the heading's id `group-{key}`). */
		key: string;
		title: string;
		description: string;
		/** Shown next to the title. */
		count: number;
		/** Shown instead of the rows when `count` is 0. */
		empty: string;
		/** The Add button's text, e.g. "Add teacher"; no button without it. */
		addLabel?: string;
		onAdd?: () => void;
		/** Something else for the header's corner, e.g. a link to the page where these are set. */
		action?: Snippet;
		children: Snippet;
	}

	let { key, title, description, count, empty, addLabel, onAdd, action, children }: Props =
		$props();
</script>

<section
	class="card bg-surface-50-950 p-4 shadow-lg"
	aria-labelledby="group-{key}"
	data-group={key}
>
	<header
		class="border-surface-200-800 flex flex-wrap items-start justify-between gap-3 border-b pb-3"
	>
		<div class="min-w-0 flex-1">
			<h2 id="group-{key}" class="h4 flex items-center gap-2">
				{title}
				<span class="preset-tonal rounded-full px-2.5 text-base">{count}</span>
			</h2>
			<p class="text-sm opacity-80">{description}</p>
		</div>
		{#if addLabel}
			<button type="button" class="btn preset-tonal-primary px-4 py-2" onclick={onAdd}>
				<Plus class="size-5" aria-hidden="true" />
				{addLabel}
			</button>
		{/if}
		{@render action?.()}
	</header>
	{#if count > 0}
		<ul class="divide-surface-200-800 divide-y">
			{@render children()}
		</ul>
	{:else}
		<p class="py-4 opacity-70">{empty}</p>
	{/if}
</section>
