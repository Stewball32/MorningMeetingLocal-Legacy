<!--
	@component
	Shown instead of the list while the first load fails (LiveList.status === 'error'): why, where
	the app looks for PocketBase, and a "Try again" button (LiveList tries again by itself too).

	```svelte
	<LoadErrorCard title="Can't load the icons" message={list.loadError} retrying={list.retrying} onRetry={list.load} />
	```
-->
<script lang="ts">
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import { POCKETBASE_URL } from '#lib/pb/requests.ts';

	interface Props {
		title: string;
		message: string;
		retrying: boolean;
		onRetry: () => void;
	}

	let { title, message, retrying, onRetry }: Props = $props();
</script>

<section class="card bg-surface-50-950 space-y-4 p-6 shadow-lg" role="alert">
	<h2 class="h4 flex items-center gap-2">
		<WifiOff class="text-error-500 size-7" aria-hidden="true" />
		{title}
	</h2>
	<p>{message}</p>
	<p class="text-sm opacity-80">
		The editor looks for PocketBase at <code class="font-mono">{POCKETBASE_URL}</code>. It tries
		again by itself every few seconds.
	</p>
	<button
		type="button"
		class="btn preset-filled-primary-500 px-5 py-2"
		disabled={retrying}
		onclick={onRetry}
	>
		<RefreshCw class="size-5 {retrying ? 'animate-spin' : ''}" aria-hidden="true" />
		{retrying ? 'Trying…' : 'Try again'}
	</button>
</section>
