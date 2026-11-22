<!--
	@component
	The card at the top of every editor page: a "Home" link to the hub (/), the page title (also the
	window title) and description, a badge while live updates are not connected, and the page's own
	buttons (`actions`, e.g. "Add person").

	```svelte
	<EditorHeader title="Icons" description="..." live={list.status === 'ready' ? list.live : null}>
		{#snippet actions()}<button ...>Add icon</button>{/snippet}
	</EditorHeader>
	```
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import House from '@lucide/svelte/icons/house';
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		description: string;
		/**
		 * The live connection (LiveList.live): a "Connecting…" / "Reconnecting…" badge shows while it
		 * isn't 'live'. Pass null until the page has loaded (the loading and error cards say enough).
		 */
		live?: 'connecting' | 'live' | 'offline' | null;
		/** The page's buttons, at the right end. */
		actions?: Snippet;
	}

	let { title, description, live = null, actions }: Props = $props();
</script>

<svelte:head>
	<title>{title} · Morning Meeting</title>
</svelte:head>

<header class="card bg-surface-50-950 flex flex-wrap items-center gap-4 p-4 shadow-lg">
	<a href={resolve('/')} class="btn preset-tonal px-4 py-2">
		<House class="size-5" aria-hidden="true" />
		Home
	</a>
	<div class="min-w-48 flex-1">
		<h1 class="h3">{title}</h1>
		<p class="text-sm opacity-80">{description}</p>
	</div>
	{#if live && live !== 'live'}
		<span
			class="preset-tonal-warning inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm"
		>
			<WifiOff class="size-4" aria-hidden="true" />
			{live === 'offline' ? 'Reconnecting…' : 'Connecting…'}
		</span>
	{/if}
	{@render actions?.()}
</header>
