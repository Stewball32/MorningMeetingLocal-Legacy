<script lang="ts">
	import { resolve } from '$app/paths';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Plus from '@lucide/svelte/icons/plus';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Undo from '@lucide/svelte/icons/undo-2';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import X from '@lucide/svelte/icons/x';
	import { onDestroy, onMount, tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { Person } from '#lib/pb/types.ts';
	import { listPeople, POCKETBASE_URL, updatePerson, watchPeople } from '#lib/pb/people.ts';
	import DeletePersonDialog from '#lib/people/DeletePersonDialog.svelte';
	import { describeError } from '#lib/people/errors.ts';
	import type { PersonFormValues } from '#lib/people/form.ts';
	import PersonFormDialog from '#lib/people/PersonFormDialog.svelte';
	import PersonRow from '#lib/people/PersonRow.svelte';
	import {
		displayName,
		groupPeople,
		plural,
		removePerson,
		upsertPerson,
		type Flag,
		type GroupKey
	} from '#lib/people/people.ts';

	interface Group {
		key: GroupKey;
		title: string;
		description: string;
		empty: string;
		add?: { label: string; preset: Partial<PersonFormValues> };
	}

	const GROUPS: Group[] = [
		{
			key: 'teachers',
			title: 'Teachers',
			description: 'Shown on the teacher attendance page.',
			empty: 'No teachers yet.',
			add: { label: 'Add teacher', preset: { role: 'teacher' } }
		},
		{
			key: 'students',
			title: 'Students',
			description: 'Shown on the student attendance page.',
			empty: 'No students yet.',
			add: { label: 'Add student', preset: { role: 'student' } }
		},
		{
			key: 'guests',
			title: 'Guests',
			description:
				'Regular visitors. They are only offered in the guest list (Add Guest on the guest page), not on the attendance pages.',
			empty: 'No regular guests. Turn on Guest for someone, or add one.',
			add: { label: 'Add guest', preset: { role: 'teacher', is_guest: true } }
		},
		{
			key: 'inactive',
			title: 'Inactive',
			description:
				'Hidden from every slide, with their attendance history kept. Turn Active back on to bring someone back.',
			empty: ''
		}
	];

	// --- Loading and live updates ------------------------------------------------------------

	let status: 'loading' | 'ready' | 'error' = $state('loading');
	let loadError = $state('');
	let retrying = $state(false);
	let people: Person[] = $state([]);
	/** The realtime connection that keeps this list in step with other windows. */
	let live: 'connecting' | 'live' | 'offline' = $state('connecting');
	const groups = $derived(groupPeople(people));

	let destroyed = false;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;
	let watchRetryTimer: ReturnType<typeof setTimeout> | undefined;
	let stopWatching: (() => Promise<void>) | undefined;
	let watching = false;

	/** (Re)loads everyone. A failure only replaces the list with an error before the first load. */
	async function load() {
		clearTimeout(retryTimer);
		if (status === 'error') retrying = true;
		try {
			const list = await listPeople();
			if (destroyed) return;
			people = list;
			status = 'ready';
			loadError = '';
			startWatching();
		} catch (error) {
			if (destroyed || status === 'ready') return;
			console.error('Could not load people', error);
			loadError = describeError(error, 'load the people').message;
			status = 'error';
			retryTimer = setTimeout(load, 5000);
		} finally {
			retrying = false;
		}
	}

	function startWatching() {
		if (watching || destroyed) return;
		watching = true;
		watchPeople({
			onChange: (event) => {
				people =
					event.action === 'delete'
						? removePerson(people, event.record.id)
						: upsertPerson(people, event.record);
			},
			onConnect: () => {
				const missedChanges = live === 'offline';
				live = 'live';
				if (missedChanges) load();
			},
			onDisconnect: () => {
				live = 'offline';
			}
		}).then(
			(stop) => {
				if (destroyed) {
					stop();
					return;
				}
				stopWatching = stop;
				live = 'live';
				load(); // catch anything that changed between the first load and subscribing
			},
			(error) => {
				console.error('Could not start live updates', error);
				watching = false;
				live = 'offline';
				watchRetryTimer = setTimeout(startWatching, 5000);
			}
		);
	}

	onMount(load);
	onDestroy(() => {
		destroyed = true;
		clearTimeout(retryTimer);
		clearTimeout(watchRetryTimer);
		clearTimeout(noticeTimer);
		stopWatching?.();
	});

	// --- Messages at the bottom of the page --------------------------------------------------

	interface Notice {
		text: string;
		tone: 'success' | 'error';
		undo?: () => void;
	}
	let notice: Notice | null = $state(null);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;
	function show(next: Notice) {
		clearTimeout(noticeTimer);
		notice = next;
		// Errors stay until dismissed; confirmations fade after a while.
		if (next.tone === 'success') noticeTimer = setTimeout(() => (notice = null), 8000);
	}
	function undoNotice() {
		const undo = notice?.undo;
		notice = null;
		undo?.();
	}

	// --- Active / Guest switches -------------------------------------------------------------

	const pending = new SvelteSet<string>();
	const busyFlags = (id: string): Flag[] =>
		(['active', 'is_guest'] as const).filter((flag) => pending.has(`${id}:${flag}`));

	function flagMessage(person: Person, flag: Flag): string {
		const name = displayName(person);
		if (flag === 'active')
			return person.active
				? `${name} is active again and back on the slides.`
				: `${name} is now inactive: hidden from the slides, history kept.`;
		if (person.is_guest) return `${name} is now a guest: only offered in the guest list.`;
		return person.active
			? `${name} is no longer a guest and is back on the ${person.role} attendance page.`
			: `${name} is no longer a guest.`;
	}

	/**
	 * Applies a change that can move a person's row to another group, where it is created anew.
	 * If one of the row's switches has focus, it is taken off first (zag would otherwise handle the
	 * blur of a switch that no longer exists) and given to the same switch in the row's new place.
	 */
	async function changeRow(id: string, change: () => void) {
		const focused = document.activeElement;
		const row = `li[data-person="${id}"]`;
		const inputs = () => [...document.querySelectorAll<HTMLInputElement>(`${row} input`)];
		const index = focused instanceof HTMLInputElement ? inputs().indexOf(focused) : -1;
		if (index >= 0) (focused as HTMLInputElement).blur();
		change();
		if (index < 0) return;
		await tick();
		inputs()[index]?.focus({ preventScroll: true });
	}

	async function setFlag(person: Person, flag: Flag, value: boolean, undoable = true) {
		const key = `${person.id}:${flag}`;
		if (pending.has(key)) return;
		pending.add(key);
		// Move the switch (and the row) right away; put it back if the save fails.
		const before = people.find((p) => p.id === person.id) ?? person;
		changeRow(person.id, () => (people = upsertPerson(people, { ...before, [flag]: value })));
		try {
			const saved = await updatePerson(person.id, { [flag]: value });
			people = upsertPerson(people, saved);
			show({
				text: flagMessage(saved, flag),
				tone: 'success',
				undo: undoable ? () => setFlag(saved, flag, !value, false) : undefined
			});
		} catch (error) {
			const problem = describeError(error, `change ${displayName(person)}`);
			const current = people.find((p) => p.id === person.id);
			if (problem.notFound) people = removePerson(people, person.id);
			else if (current)
				changeRow(person.id, () => (people = upsertPerson(people, { ...current, [flag]: !value })));
			show({ text: problem.message, tone: 'error' });
		} finally {
			pending.delete(key);
		}
	}

	// --- Add / edit / delete -----------------------------------------------------------------

	let formOpen = $state(false);
	let editing: Person | null = $state(null);
	let formPreset: Partial<PersonFormValues> = $state({});

	function openAdd(preset: Partial<PersonFormValues> = {}) {
		editing = null;
		formPreset = preset;
		formOpen = true;
	}

	function openEdit(person: Person) {
		editing = person;
		formPreset = {};
		formOpen = true;
	}

	function onSaved(person: Person, created: boolean) {
		people = upsertPerson(people, person);
		formOpen = false;
		show({
			text: created ? `Added ${displayName(person)}.` : `Saved ${displayName(person)}.`,
			tone: 'success'
		});
	}

	let deleteOpen = $state(false);
	let deleteTarget: Person | null = $state(null);

	function openDelete(person: Person) {
		deleteTarget = person;
		deleteOpen = true;
	}

	function onDeleted(person: Person, days: number | null, alreadyGone: boolean) {
		people = removePerson(people, person.id);
		deleteOpen = false;
		const name = displayName(person);
		show({
			text: alreadyGone
				? `${name} had already been deleted (in another window).`
				: days
					? `Deleted ${name} and ${plural(days, 'day')} of attendance history.`
					: `Deleted ${name}.`,
			tone: 'success'
		});
	}

	function onDeactivate(person: Person) {
		deleteOpen = false;
		const current = people.find((p) => p.id === person.id) ?? person;
		if (current.active) setFlag(current, 'active', false);
	}
</script>

<svelte:head>
	<title>People · Morning Meeting</title>
</svelte:head>

<div class="mx-auto max-w-5xl space-y-4 px-4 pt-10 pb-28" data-people-editor>
	<header class="card bg-surface-50-950 flex flex-wrap items-center gap-4 p-4 shadow-lg">
		<a href={resolve('/')} class="btn preset-tonal px-4 py-2">
			<ArrowLeft class="size-5" aria-hidden="true" />
			Home
		</a>
		<div class="min-w-48 flex-1">
			<h1 class="h3">People</h1>
			<p class="text-sm opacity-80">
				Everyone the slides can show: students, teachers and regular guests.
			</p>
		</div>
		{#if status === 'ready' && live !== 'live'}
			<span
				class="preset-tonal-warning inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm"
			>
				<WifiOff class="size-4" aria-hidden="true" />
				{live === 'offline' ? 'Reconnecting…' : 'Connecting…'}
			</span>
		{/if}
		<button
			type="button"
			class="btn preset-filled-primary-500 px-5 py-3 text-lg"
			disabled={status !== 'ready'}
			onclick={() => openAdd()}
		>
			<UserPlus class="size-6" aria-hidden="true" />
			Add person
		</button>
	</header>

	{#if status === 'ready' && live === 'offline'}
		<div class="card preset-tonal-warning flex items-start gap-3 p-4" role="status">
			<WifiOff class="mt-0.5 size-5 shrink-0" aria-hidden="true" />
			<p>
				Lost the connection to PocketBase; trying to reconnect. Changes made now won't be saved, and
				changes from other windows show up once it's back.
			</p>
		</div>
	{/if}

	{#if status === 'loading'}
		<section class="card bg-surface-50-950 space-y-4 p-6 shadow-lg" aria-busy="true">
			<p class="text-lg">Loading people…</p>
			{#each [1, 2, 3] as row (row)}
				<div class="flex items-center gap-4">
					<div class="placeholder-circle size-16 animate-pulse"></div>
					<div class="flex-1 space-y-2">
						<div class="placeholder h-5 w-1/3 animate-pulse"></div>
						<div class="placeholder h-4 w-1/2 animate-pulse"></div>
					</div>
				</div>
			{/each}
		</section>
	{:else if status === 'error'}
		<section class="card bg-surface-50-950 space-y-4 p-6 shadow-lg" role="alert">
			<h2 class="h4 flex items-center gap-2">
				<WifiOff class="text-error-500 size-7" aria-hidden="true" />
				Can't load the people
			</h2>
			<p>{loadError}</p>
			<p class="text-sm opacity-80">
				The editor looks for PocketBase at <code class="font-mono">{POCKETBASE_URL}</code>. It tries
				again by itself every few seconds.
			</p>
			<button
				type="button"
				class="btn preset-filled-primary-500 px-5 py-2"
				disabled={retrying}
				onclick={load}
			>
				<RefreshCw class="size-5 {retrying ? 'animate-spin' : ''}" aria-hidden="true" />
				{retrying ? 'Trying…' : 'Try again'}
			</button>
		</section>
	{:else if people.length === 0}
		<section class="card bg-surface-50-950 space-y-4 p-8 text-center shadow-lg">
			<h2 class="h3">No people yet</h2>
			<p>
				Add the students and teachers of your class; they then show up on the attendance slides.
			</p>
			<div class="flex flex-wrap justify-center gap-3">
				<button
					type="button"
					class="btn preset-filled-primary-500 px-5 py-3 text-lg"
					onclick={() => openAdd({ role: 'student' })}
				>
					<Plus class="size-6" aria-hidden="true" /> Add a student
				</button>
				<button
					type="button"
					class="btn preset-tonal-primary px-5 py-3 text-lg"
					onclick={() => openAdd({ role: 'teacher' })}
				>
					<Plus class="size-6" aria-hidden="true" /> Add a teacher
				</button>
			</div>
		</section>
	{:else}
		{#each GROUPS as group (group.key)}
			{@const list = groups[group.key]}
			{#if group.key !== 'inactive' || list.length > 0}
				<section
					class="card bg-surface-50-950 p-4 shadow-lg"
					aria-labelledby="group-{group.key}"
					data-group={group.key}
				>
					<header
						class="border-surface-200-800 flex flex-wrap items-start justify-between gap-3 border-b pb-3"
					>
						<div class="min-w-0 flex-1">
							<h2 id="group-{group.key}" class="h4 flex items-center gap-2">
								{group.title}
								<span class="preset-tonal rounded-full px-2.5 text-base">{list.length}</span>
							</h2>
							<p class="text-sm opacity-80">{group.description}</p>
						</div>
						{#if group.add}
							{@const add = group.add}
							<button
								type="button"
								class="btn preset-tonal-primary px-4 py-2"
								onclick={() => openAdd(add.preset)}
							>
								<Plus class="size-5" aria-hidden="true" />
								{add.label}
							</button>
						{/if}
					</header>
					{#if list.length > 0}
						<ul class="divide-surface-200-800 divide-y">
							{#each list as person (person.id)}
								<PersonRow
									{person}
									busy={busyFlags(person.id)}
									onToggle={(flag, value) => setFlag(person, flag, value)}
									onEdit={() => openEdit(person)}
									onDelete={() => openDelete(person)}
								/>
							{/each}
						</ul>
					{:else}
						<p class="py-4 opacity-70">{group.empty}</p>
					{/if}
				</section>
			{/if}
		{/each}
	{/if}
</div>

<PersonFormDialog
	open={formOpen}
	person={editing}
	preset={formPreset}
	{onSaved}
	onClose={() => (formOpen = false)}
/>

<DeletePersonDialog
	open={deleteOpen}
	person={deleteTarget}
	onClose={() => (deleteOpen = false)}
	{onDeleted}
	{onDeactivate}
/>

<div
	class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
	role="status"
	aria-live="polite"
>
	{#if notice}
		<div
			class="card pointer-events-auto flex max-w-2xl items-center gap-3 px-4 py-3 shadow-xl {notice.tone ===
			'error'
				? 'preset-filled-error-500'
				: 'preset-filled-surface-900-100'}"
		>
			<p class="min-w-0 flex-1">{notice.text}</p>
			{#if notice.undo}
				<button type="button" class="btn preset-tonal-surface px-3 py-1.5" onclick={undoNotice}>
					<Undo class="size-4" aria-hidden="true" /> Undo
				</button>
			{/if}
			<button
				type="button"
				class="btn-icon hover:preset-tonal"
				aria-label="Dismiss message"
				onclick={() => (notice = null)}
			>
				<X class="size-5" aria-hidden="true" />
			</button>
		</div>
	{/if}
</div>

<style>
	/* app.css gives html and body `transform: translateZ(0)`. A transform makes position: fixed
	   relative to the whole page instead of the window, which on this long, scrolling page put
	   the dialogs and the message bar far below the visible area. Switch it off while the editor
	   is shown. */
	:global(html:has([data-people-editor])),
	:global(body:has([data-people-editor])) {
		transform: none;
	}
</style>
