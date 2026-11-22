<!--
	@component
	Explains a dropped live connection. Show it under the header while the page is loaded but not
	live: `{#if list.status === 'ready' && list.live === 'offline'}<OfflineNotice />{/if}`.
-->
<script lang="ts">
	import WifiOff from '@lucide/svelte/icons/wifi-off';
</script>

<div class="card preset-tonal-warning flex items-start gap-3 p-4" role="status">
	<WifiOff class="mt-0.5 size-5 shrink-0" aria-hidden="true" />
	<p>
		Lost the connection to PocketBase; trying to reconnect. Changes made now won't be saved, and
		changes from other windows show up once it's back.
	</p>
</div>
