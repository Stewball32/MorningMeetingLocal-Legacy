<!--
	@component
	Placeholder rows while a page's first load is on its way (LiveList.status === 'loading').
-->
<script lang="ts">
	interface Props {
		/** e.g. "Loading icons…" */
		text: string;
		rows?: number;
	}

	let { text, rows = 3 }: Props = $props();
</script>

<section class="card bg-surface-50-950 space-y-4 p-6 shadow-lg" aria-busy="true">
	<p class="text-lg">{text}</p>
	{#each Array.from({ length: rows }, (_, row) => row) as row (row)}
		<div class="flex items-center gap-4">
			<div class="placeholder-circle size-16 animate-pulse"></div>
			<div class="flex-1 space-y-2">
				<div class="placeholder h-5 w-1/3 animate-pulse"></div>
				<div class="placeholder h-4 w-1/2 animate-pulse"></div>
			</div>
		</div>
	{/each}
</section>
