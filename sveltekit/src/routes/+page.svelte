<script lang="ts">
	import { resolve } from '$app/paths';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Images from '@lucide/svelte/icons/images';
	import Presentation from '@lucide/svelte/icons/presentation';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Users from '@lucide/svelte/icons/users';
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import { onMount } from 'svelte';
	import { isPbError } from '#lib/editor/errors.ts';
	import { getBirthdayPeople } from '#lib/birthdays.ts';
	import {
		dayLabel,
		iconsSummary,
		monthsFrom,
		nextBirthdaySummary,
		peopleSummary,
		schoolBadge,
		upcomingDays,
		type ObservedDay,
		type UpcomingDay
	} from '#lib/home/summary.ts';
	import { getActiveObservances, observancesForMonth } from '#lib/pb/calendar.ts';
	import { pb } from '#lib/pb/index.ts';
	import { POCKETBASE_URL } from '#lib/pb/requests.ts';
	import type { IconRecord, Person } from '#lib/pb/types.ts';

	// --- Live summaries ----------------------------------------------------------------------
	// Each tile works as a plain link whatever happens here; a summary that can't be loaded just
	// says so.

	type Summary<T> =
		{ state: 'loading' } | { state: 'ready'; value: T } | { state: 'failed'; offline: boolean };

	/** A request that gets no answer in this time fails as "can't reach PocketBase". */
	const TIMEOUT_MS = 10_000;
	const timeout = () => AbortSignal.timeout(TIMEOUT_MS);
	const readOptions = () => ({ requestKey: null, signal: timeout() });
	/** While PocketBase can't be reached, the summaries are tried again this often. */
	const RETRY_MS = 7_000;

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

	interface CalendarSummary {
		/** The next days with observances (built-in holidays and the class's own). */
		days: UpcomingDay[];
		/** "Next birthday: Bluey, Mon, Nov 30"; '' when there is none (or it couldn't be loaded). */
		birthday: string;
	}

	/**
	 * The next 3 days the calendar slide shows something on (built-in holidays included), and the
	 * next birthday on its own line.
	 */
	async function nextObservances(): Promise<CalendarSummary> {
		// What the slide's getHolidayMap does for each month, from one request.
		const [records, birthday] = await Promise.all([
			getActiveObservances(timeout()),
			// Only active people count. Without the birthdays the days still show.
			getBirthdayPeople(timeout()).then(
				(people) => nextBirthdaySummary(people, today),
				(error) => {
					console.error('Could not load the birthdays', error);
					return '';
				}
			)
		]);
		const found: ObservedDay[] = [];
		for (const { year, month } of monthsFrom(today, 3)) {
			for (const list of observancesForMonth(records, year, month).values()) found.push(...list);
			if (upcomingDays(found, today).length >= 3) break;
		}
		return { days: upcomingDays(found, today), birthday };
	}

	let people = $state<Summary<string>>({ state: 'loading' });
	let icons = $state<Summary<string>>({ state: 'loading' });
	let calendar = $state<Summary<CalendarSummary>>({ state: 'loading' });
	const offline = $derived(
		[people, icons, calendar].some((summary) => summary.state === 'failed' && summary.offline)
	);

	async function summarize<T>(what: string, get: () => Promise<T>, set: (s: Summary<T>) => void) {
		try {
			set({ state: 'ready', value: await get() });
		} catch (error) {
			console.error(`Could not load the ${what} summary`, error);
			// Status 0: no answer (refused, or timed out).
			set({ state: 'failed', offline: isPbError(error) && error.status === 0 });
		}
	}

	/** When the summaries were (last) loaded; the calendar's "Today" and "Tomorrow" go by it. */
	let today = $state(new Date());
	let loading = $state(false);
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
	// Can't reach PocketBase: try again every few seconds, so the summaries come back by
	// themselves once it is running again (a try still under way is not started twice).
	$effect(() => {
		if (!offline) return;
		const timer = setInterval(loadSummaries, RETRY_MS);
		return () => clearInterval(timer);
	});
	/** Coming back to this tab or window (e.g. after editing elsewhere): bring the summaries up to date. */
	function refresh() {
		if (document.visibilityState === 'visible' && Date.now() - today.getTime() > 5000)
			loadSummaries();
	}

	// --- Tiles -------------------------------------------------------------------------------

	type EditorPath = 'people' | 'icons' | 'calendar';
	const EDITOR_ROUTES = {
		people: '/(editor)/people',
		icons: '/(editor)/icons',
		calendar: '/(editor)/calendar'
	} as const;
	const editorHref = (path: EditorPath) => resolve(EDITOR_ROUTES[path]);

	interface Tile {
		key: 'people' | 'icons' | 'calendar';
		title: string;
		icon: typeof Users;
		summary: Summary<string> | Summary<CalendarSummary>;
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
				<div
					class="card preset-tonal-warning flex flex-wrap items-start gap-3 p-3 text-sm"
					data-offline
				>
					<WifiOff class="mt-0.5 size-5 shrink-0" aria-hidden="true" />
					<!-- Only the words are a live region: the button's Trying… comes back every few seconds. -->
					<p class="min-w-48 flex-1" role="status">
						Can't reach PocketBase at <code class="font-mono">{POCKETBASE_URL}</code>, so the
						summaries are missing. The presenter and the editors need it too: check that it is
						running. This page tries again by itself every few seconds.
					</p>
					<!-- aria-disabled, not disabled: the keyboard stays on the button while it tries. -->
					<button
						type="button"
						class="btn preset-filled-primary-500 px-4 py-1.5 aria-disabled:opacity-50"
						aria-disabled={loading}
						onclick={loadSummaries}
					>
						<RefreshCw class="size-4 {loading ? 'animate-spin' : ''}" aria-hidden="true" />
						{loading ? 'Trying…' : 'Try again'}
					</button>
				</div>
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
							{:else}
								{@const { days, birthday } = tile.summary.value}
								{#if days.length === 0}
									<span class="text-sm">Nothing in the next few months.</span>
								{:else}
									<span class="sr-only">Coming up:</span>
									<ul class="space-y-1 text-sm">
										{#each days as day (day.date.getTime())}
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
								{#if birthday}
									<span class="text-sm" data-next-birthday>
										<span aria-hidden="true">🎂</span>
										{birthday}
									</span>
								{/if}
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</div>
</main>
