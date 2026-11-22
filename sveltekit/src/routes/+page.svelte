<script lang="ts">
	import { resolve } from '$app/paths';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Images from '@lucide/svelte/icons/images';
	import Presentation from '@lucide/svelte/icons/presentation';
	import Users from '@lucide/svelte/icons/users';
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import { onMount } from 'svelte';
	import { isPbError } from '#lib/editor/errors.ts';
	import {
		dayLabel,
		iconsSummary,
		monthsFrom,
		peopleSummary,
		schoolBadge,
		upcomingDays,
		type ObservedDay,
		type UpcomingDay
	} from '#lib/home/summary.ts';
	import { getHolidayMap } from '#lib/pb/calendar.ts';
	import { pb } from '#lib/pb/index.ts';
	import { POCKETBASE_URL } from '#lib/pb/requests.ts';
	import type { IconRecord, Person } from '#lib/pb/types.ts';

	// --- Live summaries ----------------------------------------------------------------------
	// Each tile works as a plain link whatever happens here; a summary that can't be loaded just
	// says so.

	type Summary<T> =
		{ state: 'loading' } | { state: 'ready'; value: T } | { state: 'failed'; offline: boolean };

	const TIMEOUT_MS = 10_000;
	const readOptions = () => ({ requestKey: null, signal: AbortSignal.timeout(TIMEOUT_MS) });

	class TimedOut extends Error {}
	const withTimeout = <T,>(promise: Promise<T>) =>
		new Promise<T>((done, fail) => {
			const timer = setTimeout(() => fail(new TimedOut('PocketBase took too long')), TIMEOUT_MS);
			promise.then(
				(value) => {
					clearTimeout(timer);
					done(value);
				},
				(error) => {
					clearTimeout(timer);
					fail(error);
				}
			);
		});

	async function countPeople(): Promise<string> {
		const people = await pb
			.collection('people')
			.getFullList<Person>({ fields: 'id,role,is_guest,active', ...readOptions() });
		return peopleSummary(people);
	}

	async function countIcons(): Promise<string> {
		const icons = await pb
			.collection('icons')
			.getFullList<IconRecord>({ fields: 'id,for_guests,for_calendar', ...readOptions() });
		return iconsSummary(icons);
	}

	/** The next 3 days the calendar slide shows something on (built-in holidays included). */
	async function nextObservances(): Promise<UpcomingDay[]> {
		const found: ObservedDay[] = [];
		// One month after another: getHolidayMap's requests would cancel each other in parallel.
		for (const { year, month } of monthsFrom(today, 3)) {
			const map = await withTimeout(getHolidayMap(year, month));
			for (const list of map.values()) found.push(...list);
			if (upcomingDays(found, today).length >= 3) break;
		}
		return upcomingDays(found, today);
	}

	let people = $state<Summary<string>>({ state: 'loading' });
	let icons = $state<Summary<string>>({ state: 'loading' });
	let calendar = $state<Summary<UpcomingDay[]>>({ state: 'loading' });
	const offline = $derived(
		[people, icons, calendar].some((summary) => summary.state === 'failed' && summary.offline)
	);

	async function summarize<T>(what: string, get: () => Promise<T>, set: (s: Summary<T>) => void) {
		try {
			set({ state: 'ready', value: await get() });
		} catch (error) {
			console.error(`Could not load the ${what} summary`, error);
			set({
				state: 'failed',
				offline: error instanceof TimedOut || (isPbError(error) && error.status === 0)
			});
		}
	}

	/** When the summaries were (last) loaded; the calendar's "Today" and "Tomorrow" go by it. */
	let today = $state(new Date());
	let loading = false;
	async function loadSummaries() {
		if (loading) return;
		loading = true;
		today = new Date();
		await Promise.all([
			summarize('people', countPeople, (s) => (people = s)),
			summarize('icons', countIcons, (s) => (icons = s)),
			summarize('calendar', nextObservances, (s) => (calendar = s))
		]);
		loading = false;
	}

	onMount(loadSummaries);
	/** Coming back to this tab or window (e.g. after editing elsewhere): bring the summaries up to date. */
	function refresh() {
		if (document.visibilityState === 'visible' && Date.now() - today.getTime() > 5000)
			loadSummaries();
	}

	// --- Tiles -------------------------------------------------------------------------------

	// The Icons and Calendar Observances pages come from their own branches: until they are
	// merged, the route types don't know them (and those tiles lead to a "not found" page).
	type EditorPath = 'people' | 'icons' | 'calendar';
	const editorHref = (path: EditorPath) => resolve(path as 'people');

	interface Tile {
		key: 'people' | 'icons' | 'calendar';
		title: string;
		icon: typeof Users;
		summary: Summary<string> | Summary<UpcomingDay[]>;
	}
	const tiles: Tile[] = $derived([
		{ key: 'people', title: 'People', icon: Users, summary: people },
		{ key: 'icons', title: 'Icons', icon: Images, summary: icons },
		{ key: 'calendar', title: 'Calendar Observances', icon: CalendarDays, summary: calendar }
	]);
	const BADGE_CLASS = {
		none: 'preset-filled-error-500',
		short: 'preset-filled-warning-500',
		full: ''
	};
</script>

<svelte:document onvisibilitychange={refresh} />
<svelte:window onfocus={refresh} />

<main class="flex min-h-screen items-center justify-center p-4 sm:p-6">
	<div class="w-full max-w-5xl space-y-4">
		<section class="card bg-surface-50-950 space-y-4 p-6 text-center shadow-xl sm:p-8">
			<h1 class="h2">Morning Meeting</h1>
			<a
				href={resolve('/present')}
				class="btn preset-filled-primary-500 w-full gap-3 py-4 text-3xl"
			>
				<Presentation class="size-10" aria-hidden="true" />
				Presenter
			</a>
			<p class="text-sm opacity-80">Runs the slides for today's morning meeting.</p>
		</section>

		<nav class="card bg-surface-50-950 space-y-3 p-4 shadow-xl sm:p-6" aria-labelledby="edit">
			<div>
				<h2 id="edit" class="h3">Edit</h2>
				<p class="text-sm opacity-80">What the slides show.</p>
			</div>

			{#if offline}
				<p class="card preset-tonal-warning flex items-start gap-3 p-3 text-sm" role="status">
					<WifiOff class="mt-0.5 size-5 shrink-0" aria-hidden="true" />
					<span>
						Can't reach PocketBase at <code class="font-mono">{POCKETBASE_URL}</code>, so the
						summaries are missing. The presenter and the editors need it too: check that it is
						running.
					</span>
				</p>
			{/if}

			<ul class="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1.6fr]">
				{#each tiles as tile (tile.key)}
					{@const Icon = tile.icon}
					<!-- The calendar tile lists days: on two columns it gets a row of its own. -->
					<li class={tile.key === 'calendar' ? 'md:max-lg:col-span-2' : ''}>
						<a
							href={editorHref(tile.key)}
							class="card preset-tonal-primary hover:preset-filled-primary-500 flex h-full flex-col gap-2 p-4 transition-colors"
							data-tile={tile.key}
						>
							<span class="flex items-center gap-3 text-xl font-semibold">
								<Icon class="size-7 shrink-0" aria-hidden="true" />
								{tile.title}
							</span>
							{#if tile.summary.state === 'loading'}
								<span class="placeholder block h-4 w-3/4 animate-pulse" aria-hidden="true"></span>
							{:else if tile.summary.state === 'failed'}
								<span class="text-sm opacity-80">Couldn't load the summary.</span>
							{:else if typeof tile.summary.value === 'string'}
								<span class="text-sm">{tile.summary.value}</span>
							{:else if tile.summary.value.length === 0}
								<span class="text-sm">Nothing in the next few months.</span>
							{:else}
								<span class="sr-only">Coming up:</span>
								<ul class="space-y-1 text-sm">
									{#each tile.summary.value as day (day.date.getTime())}
										{@const badge = schoolBadge(day.school)}
										<li>
											<span class="font-semibold">{dayLabel(day.date, today)}:</span>
											{day.names.join(', ')}
											{#if badge}
												<span
													class="{BADGE_CLASS[
														day.school
													]} ml-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
												>
													{badge}
												</span>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</div>
</main>
