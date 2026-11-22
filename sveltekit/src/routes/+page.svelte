<script lang="ts">
	import { resolve } from '$app/paths';
	import Presentation from '@lucide/svelte/icons/presentation';
	import Users from '@lucide/svelte/icons/users';
</script>

<main class="flex min-h-screen items-center justify-center p-6">
	<nav
		class="card bg-surface-50-950 w-full max-w-md space-y-4 p-8 text-center shadow-xl"
		aria-label="Morning Meeting"
	>
		<h1 class="h2">Morning Meeting</h1>
		<a href={resolve('/present')} class="btn preset-filled-primary-500 w-full gap-3 py-4 text-2xl">
			<Presentation class="size-8" aria-hidden="true" />
			Presenter
		</a>
		<a href={resolve('/people')} class="btn preset-tonal-primary w-full gap-3 py-4 text-2xl">
			<Users class="size-8" aria-hidden="true" />
			People
		</a>
		<p class="text-sm opacity-80">
			Presenter runs the slides. People is where you add and edit the students, teachers and regular
			guests.
		</p>
	</nav>
</main>
