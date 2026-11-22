<script lang="ts">
	import '../app.css';
	import { dev } from '$app/env';

	let { children } = $props();
</script>

<svelte:head>
	<title>Morning Meeting</title>
</svelte:head>

{#if dev}
	<!-- the current Tailwind breakpoint, while developing only -->
	<div class="absolute top-0 left-0 z-10 text-xl text-blue-600">
		<p class="block sm:hidden">XS</p>
		<p class="hidden sm:block md:hidden">SM</p>
		<p class="hidden md:block lg:hidden">MD</p>
		<p class="hidden lg:block xl:hidden">LG</p>
		<p class="hidden xl:block 2xl:hidden">XL</p>
		<p class="3xl:hidden hidden 2xl:block">2XL</p>
		<p class="3xl:block hidden">3XL</p>
	</div>
{/if}

<div class="min-w-screen relative min-h-screen">
	{@render children()}
</div>
