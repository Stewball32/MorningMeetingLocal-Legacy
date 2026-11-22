<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import { onDestroy, onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import EditorHeader from '#lib/editor/EditorHeader.svelte';
	import { describeError } from '#lib/editor/errors.ts';
	import { FocusReturn, keepRowFocus } from '#lib/editor/focus.ts';
	import type { SaveOutcome } from '#lib/editor/form.ts';
	import GroupSection from '#lib/editor/GroupSection.svelte';
	import { withNeighbours } from '#lib/editor/list.ts';
	import { LiveList } from '#lib/editor/live-list.svelte.ts';
	import LoadErrorCard from '#lib/editor/LoadErrorCard.svelte';
	import LoadingCard from '#lib/editor/LoadingCard.svelte';
	import NoticeBar from '#lib/editor/NoticeBar.svelte';
	import { Notices } from '#lib/editor/notices.svelte.ts';
	import OfflineNotice from '#lib/editor/OfflineNotice.svelte';
	import type { Person } from '#lib/pb/types.ts';
	import { listPeople, PEOPLE, updatePerson, type PersonHistory } from '#lib/pb/people.ts';
	import DeletePersonDialog from '#lib/people/DeletePersonDialog.svelte';
	import type { PersonFormValues } from '#lib/people/form.ts';
	import PersonFormDialog from '#lib/people/PersonFormDialog.svelte';
	import PersonRow from '#lib/people/PersonRow.svelte';
	import {
		displayName,
		flagMessage,
		groupOf,
		groupPeople,
		historyParts,
		PERSON_ERRORS,
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

	const people = new LiveList<Person>({
		collection: PEOPLE,
		load: listPeople,
		doing: 'load the people'
	});
	const groups = $derived(groupPeople(people.items));
	const notices = new Notices();

	onMount(() => people.start());
	onDestroy(() => {
		people.stop();
		notices.destroy();
	});

	// --- Active / Guest switches -------------------------------------------------------------

	const pending = new SvelteSet<string>();
	const busyFlags = (id: string): Flag[] =>
		(['active', 'is_guest'] as const).filter((flag) => pending.has(`${id}:${flag}`));

	/** Changes a person's row, which can move it to another group (see keepRowFocus). */
	const changeRow = (id: string, change: () => void) =>
		keepRowFocus(`li[data-person="${id}"]`, change);

	async function setFlag(person: Person, flag: Flag, value: boolean, undoable = true) {
		const key = `${person.id}:${flag}`;
		if (pending.has(key)) return;
		pending.add(key);
		// Move the switch (and the row) right away; put it back if the save fails.
		const before = people.find(person.id) ?? person;
		changeRow(person.id, () => people.upsert({ ...before, [flag]: value }));
		try {
			const saved = await updatePerson(person.id, { [flag]: value });
			people.upsert(saved);
			notices.show({
				text: flagMessage(saved, flag),
				tone: 'success',
				undo: undoable ? () => setFlag(saved, flag, !value, false) : undefined
			});
		} catch (error) {
			const problem = describeError(error, `change ${displayName(person)}`, PERSON_ERRORS);
			const current = people.find(person.id);
			if (problem.notFound) people.remove(person.id);
			else if (current) changeRow(person.id, () => people.upsert({ ...current, [flag]: !value }));
			notices.show({ text: problem.message, tone: 'error' });
		} finally {
			pending.delete(key);
		}
	}

	// --- Add / edit / delete -----------------------------------------------------------------

	// Each opening of a dialog gets a new session number, so it starts with fresh content.
	let formOpen = $state(false);
	let formSession = $state(0);
	let editing: Person | null = $state.raw(null);
	let formPreset: Partial<PersonFormValues> = $state.raw({});

	/** Where focus goes when a dialog closes (see FocusReturn). */
	const focus = new FocusReturn({
		row: (id) => `li[data-person="${id}"] [data-edit]`,
		group: (key) => `[data-group="${key}"] header button`,
		fallback: '[data-add-person]'
	});
	function rememberFocus(person: Person | null) {
		const group = person ? groupOf(person) : null;
		focus.remember(person && group ? withNeighbours(groups[group], person.id) : [], group);
	}

	function openAdd(preset: Partial<PersonFormValues> = {}) {
		rememberFocus(null);
		editing = null;
		formPreset = preset;
		formSession++;
		formOpen = true;
	}

	function openEdit(person: Person) {
		rememberFocus(person);
		editing = person;
		formPreset = {};
		formSession++;
		formOpen = true;
	}

	function onSaved(person: Person, outcome: SaveOutcome) {
		formOpen = false;
		const name = displayName(person);
		if (outcome === 'unchanged') {
			// `person` is the copy the form started with: keep the list's (maybe newer) record.
			notices.show({ text: `No changes to save for ${name}.`, tone: 'success' });
			return;
		}
		people.upsert(person);
		if (outcome === 'created') focus.ids = [person.id];
		notices.show({
			text: outcome === 'created' ? `Added ${name}.` : `Saved ${name}.`,
			tone: 'success'
		});
	}

	let deleteOpen = $state(false);
	let deleteSession = $state(0);
	let deleteTarget: Person | null = $state.raw(null);

	function openDelete(person: Person) {
		rememberFocus(person);
		deleteTarget = person;
		deleteSession++;
		deleteOpen = true;
	}

	function onDeleted(person: Person, history: PersonHistory | null, alreadyGone: boolean) {
		people.remove(person.id);
		deleteOpen = false;
		const name = displayName(person);
		const parts = history ? historyParts(history) : [];
		notices.show({
			text: alreadyGone
				? `${name} had already been deleted (in another window).`
				: parts.length > 0
					? `Deleted ${name} and ${parts.join(' and ')}.`
					: `Deleted ${name}.`,
			tone: 'success'
		});
	}

	function onDeactivate(person: Person) {
		deleteOpen = false;
		const current = people.find(person.id) ?? person;
		if (current.active) setFlag(current, 'active', false);
	}
</script>

<div class="mx-auto max-w-5xl space-y-4 px-4 pt-10 pb-28">
	<EditorHeader
		title="People"
		description="Everyone the slides can show: students, teachers and regular guests."
		live={people.status === 'ready' ? people.live : null}
	>
		{#snippet actions()}
			<button
				type="button"
				class="btn preset-filled-primary-500 px-5 py-3 text-lg"
				disabled={people.status !== 'ready'}
				data-add-person
				onclick={() => openAdd()}
			>
				<UserPlus class="size-6" aria-hidden="true" />
				Add person
			</button>
		{/snippet}
	</EditorHeader>

	{#if people.status === 'ready' && people.live === 'offline'}
		<OfflineNotice />
	{/if}

	{#if people.status === 'loading'}
		<LoadingCard text="Loading people…" />
	{:else if people.status === 'error'}
		<LoadErrorCard
			title="Can't load the people"
			message={people.loadError}
			retrying={people.retrying}
			onRetry={people.load}
		/>
	{:else if people.items.length === 0}
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
				<GroupSection
					key={group.key}
					title={group.title}
					description={group.description}
					count={list.length}
					empty={group.empty}
					addLabel={group.add?.label}
					onAdd={() => openAdd(group.add?.preset)}
				>
					{#each list as person (person.id)}
						<PersonRow
							{person}
							busy={busyFlags(person.id)}
							onToggle={(flag, value) => setFlag(person, flag, value)}
							onEdit={() => openEdit(person)}
							onDelete={() => openDelete(person)}
						/>
					{/each}
				</GroupSection>
			{/if}
		{/each}
	{/if}
</div>

<PersonFormDialog
	open={formOpen}
	session={formSession}
	person={editing}
	preset={formPreset}
	{onSaved}
	onClose={() => (formOpen = false)}
	finalFocusEl={focus.target}
/>

<DeletePersonDialog
	open={deleteOpen}
	session={deleteSession}
	person={deleteTarget}
	onClose={() => (deleteOpen = false)}
	{onDeleted}
	{onDeactivate}
	finalFocusEl={focus.target}
/>

<NoticeBar {notices} />
