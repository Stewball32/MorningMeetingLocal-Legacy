<script lang="ts">
	import { PUBLIC_POCKETBASE_URL } from '$app/env/public';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import House from '@lucide/svelte/icons/house';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';

	const CHECK_EVERY_MS = 3_000;
	// a reload that fails again right away shouldn't turn into a reload loop
	const RELOADED_AT = 'mm-error-reloaded-at';

	let pocketbase: 'checking' | 'up' | 'down' = $state('checking');
	let notFound = $derived(page.status === 404);
	let details = $derived(
		page.error?.message && page.error.message !== 'Internal Error' ? page.error.message : ''
	);

	const isUp = async () => {
		try {
			const response = await fetch(`${PUBLIC_POCKETBASE_URL}/api/health`, {
				cache: 'no-store',
				signal: AbortSignal.timeout(2_500)
			});
			return response.ok;
		} catch {
			return false;
		}
	};

	const reload = () => {
		sessionStorage.setItem(RELOADED_AT, String(Date.now()));
		location.reload();
	};
	const reloadedJustNow = () =>
		Date.now() - Number(sessionStorage.getItem(RELOADED_AT) ?? 0) < 15_000;

	onMount(() => {
		if (page.status === 404) return;
		let stopped = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let wasDown = false;
		const check = async () => {
			const up = await isUp();
			if (stopped) return;
			// PocketBase is back (or was only just starting): load the page again
			if (up && (wasDown || (page.status === 503 && !reloadedJustNow()))) return reload();
			pocketbase = up ? 'up' : 'down';
			if (up) return;
			wasDown = true;
			timer = setTimeout(check, CHECK_EVERY_MS);
		};
		check();
		return () => {
			stopped = true;
			clearTimeout(timer);
		};
	});
</script>

<svelte:head>
	<title>Morning Meeting: {notFound ? 'page not found' : 'something went wrong'}</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center p-6">
	<div class="card bg-surface-50-950 w-full max-w-lg space-y-4 p-8 text-center shadow-xl">
		{#if notFound}
			<h1 class="h2">Page not found</h1>
			<p>There's no page at this address.</p>
		{:else if pocketbase === 'down'}
			<h1 class="h2">Can't reach PocketBase</h1>
			<p>
				PocketBase keeps the class's people, attendance and slides. It may still be starting up, or
				it has stopped.
			</p>
			<p class="text-sm opacity-80" role="status">
				Checking again every few seconds: this page reloads by itself as soon as PocketBase is back.
			</p>
		{:else if pocketbase === 'up'}
			<h1 class="h2">Something went wrong</h1>
			<p>{details || "This page couldn't be loaded."}</p>
			<p class="text-sm opacity-80">PocketBase is running. Try again, or go back Home.</p>
		{:else}
			<h1 class="h2">Something went wrong</h1>
			<p class="text-sm opacity-80" role="status">Checking whether PocketBase is running…</p>
		{/if}
		<div class="flex flex-wrap justify-center gap-3 pt-2">
			{#if !notFound}
				<button type="button" class="btn preset-filled-primary-500 gap-2" onclick={reload}>
					<RotateCw class="size-5" aria-hidden="true" />
					Try again
				</button>
			{/if}
			<a href={resolve('/')} class="btn preset-tonal-primary gap-2">
				<House class="size-5" aria-hidden="true" />
				Home
			</a>
		</div>
	</div>
</main>
