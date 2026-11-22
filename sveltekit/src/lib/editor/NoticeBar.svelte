<!--
	@component
	The message bar fixed at the bottom of an editor page (see notices.svelte.ts). Put it once, at
	the end of the page. It is a polite live region, so screen readers read each message.
-->
<script lang="ts">
	import Undo from '@lucide/svelte/icons/undo-2';
	import X from '@lucide/svelte/icons/x';
	import type { Notices } from './notices.svelte.ts';

	interface Props {
		notices: Notices;
	}

	let { notices }: Props = $props();
</script>

<div
	class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
	role="status"
	aria-live="polite"
>
	{#if notices.current}
		{@const notice = notices.current}
		<div
			class="card pointer-events-auto flex max-w-2xl items-center gap-3 px-4 py-3 shadow-xl {notice.tone ===
			'error'
				? 'preset-filled-error-500'
				: 'preset-filled-surface-900-100'}"
		>
			<p class="min-w-0 flex-1">{notice.text}</p>
			{#if notice.undo}
				<button type="button" class="btn preset-tonal-surface px-3 py-1.5" onclick={notices.undo}>
					<Undo class="size-4" aria-hidden="true" /> Undo
				</button>
			{/if}
			<button
				type="button"
				class="btn-icon hover:preset-tonal"
				aria-label="Dismiss message"
				onclick={notices.dismiss}
			>
				<X class="size-5" aria-hidden="true" />
			</button>
		</div>
	{/if}
</div>
