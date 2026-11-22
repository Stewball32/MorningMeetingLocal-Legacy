<script lang="ts">
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import Plus from '@lucide/svelte/icons/plus';
	import { onDestroy, onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import EditorHeader from '#lib/editor/EditorHeader.svelte';
	import { describeError } from '#lib/editor/errors.ts';
	import { FocusReturn } from '#lib/editor/focus.ts';
	import type { SaveOutcome } from '#lib/editor/form.ts';
	import GroupSection from '#lib/editor/GroupSection.svelte';
	import { withNeighbours } from '#lib/editor/list.ts';
	import { LiveList } from '#lib/editor/live-list.svelte.ts';
	import LoadErrorCard from '#lib/editor/LoadErrorCard.svelte';
	import LoadingCard from '#lib/editor/LoadingCard.svelte';
	import NoticeBar from '#lib/editor/NoticeBar.svelte';
	import { Notices } from '#lib/editor/notices.svelte.ts';
	import OfflineNotice from '#lib/editor/OfflineNotice.svelte';
	import DeleteIconDialog from '#lib/icons/DeleteIconDialog.svelte';
	import { keepSwitchFocus } from '#lib/icons/focus.ts';
	import type { IconFormValues } from '#lib/icons/form.ts';
	import IconFormDialog from '#lib/icons/IconFormDialog.svelte';
	import IconRow from '#lib/icons/IconRow.svelte';
	import {
		groupIcons,
		ICON_ERRORS,
		joinWords,
		switchMessage,
		turnedOffMessage,
		usageParts,
		type GroupKey
	} from '#lib/icons/icons.ts';
	import { allOff, USES, type UseCounts, type UseField } from '#lib/icons/uses.ts';
	import { ICONS, listIcons, updateIcon } from '#lib/pb/icons.ts';
	import type { IconRecord } from '#lib/pb/types.ts';

	interface Group {
		key: GroupKey;
		title: string;
		description: string;
		empty: string;
		add?: { label: string; preset: Partial<IconFormValues> };
	}

	const GROUPS: Group[] = [
		...USES.map((use) => ({
			key: use.key,
			title: use.group,
			description: use.description,
			empty: `No icons ${use.group.toLowerCase()} yet. Turn on ${use.label} for one, or add one.`,
			add: { label: use.addLabel, preset: { [use.field]: true } }
		})),
		{
			key: 'unused',
			title: 'Not used',
			description:
				'Every switch is off: not offered for anything new. Whatever used them before keeps their picture.',
			empty: ''
		}
	];

	// --- Loading and live updates ------------------------------------------------------------

	const icons = new LiveList<IconRecord>({
		collection: ICONS,
		load: listIcons,
		doing: 'load the icons'
	});
	const groups = $derived(groupIcons(icons.items));
	const notices = new Notices();

	onMount(() => icons.start());
	onDestroy(() => {
		icons.stop();
		notices.destroy();
	});

	// --- Use switches ------------------------------------------------------------------------

	const pending = new SvelteSet<string>();
	const busyFields = (id: string): UseField[] =>
		USES.map((use) => use.field).filter((field) => pending.has(`${id}:${field}`));

	/** Saves some of an icon's switches; the rows move right away and move back if it fails. */
	async function saveSwitches(
		icon: IconRecord,
		changes: Partial<Record<UseField, boolean>>,
		done: (saved: IconRecord) => void
	) {
		const fields = Object.keys(changes) as UseField[];
		const keys = fields.map((field) => `${icon.id}:${field}`);
		if (fields.length === 0 || keys.some((key) => pending.has(key))) return;
		for (const key of keys) pending.add(key);
		const before = icons.find(icon.id) ?? icon;
		keepSwitchFocus(icon.id, () => icons.upsert({ ...before, ...changes }));
		try {
			const saved = await updateIcon(icon.id, changes);
			icons.upsert(saved);
			done(saved);
		} catch (error) {
			const problem = describeError(error, `change ${icon.name}`, ICON_ERRORS);
			const current = icons.find(icon.id);
			if (problem.notFound) icons.remove(icon.id);
			else if (current) {
				const undone = Object.fromEntries(fields.map((field) => [field, before[field]]));
				keepSwitchFocus(icon.id, () => icons.upsert({ ...current, ...undone }));
			}
			notices.show({ text: problem.message, tone: 'error' });
		} finally {
			for (const key of keys) pending.delete(key);
		}
	}

	function setSwitch(icon: IconRecord, field: UseField, value: boolean, undoable = true) {
		const current = icons.find(icon.id) ?? icon;
		// Guest buttons show the picture: an icon without one would show a broken image.
		if (field === 'for_guests' && value && !current.image) {
			openEdit(current, { for_guests: true }, true);
			return;
		}
		saveSwitches(icon, { [field]: value }, (saved) =>
			notices.show({
				text: switchMessage(saved, field),
				tone: 'success',
				undo: undoable ? () => setSwitch(saved, field, !value, false) : undefined
			})
		);
	}

	/** "Turn off instead" (in the delete dialog): every switch off, with Undo. */
	function turnOff(icon: IconRecord, undoable = true) {
		const current = icons.find(icon.id) ?? icon;
		const changes = allOff(current);
		const fields = Object.keys(changes) as UseField[];
		saveSwitches(current, changes, (saved) =>
			notices.show({
				text: turnedOffMessage(saved.name, fields),
				tone: 'success',
				undo: undoable
					? () =>
							saveSwitches(
								saved,
								Object.fromEntries(fields.map((field) => [field, true])),
								(back) =>
									notices.show({ text: `${back.name} is turned on again.`, tone: 'success' })
							)
					: undefined
			})
		);
	}

	// --- Add / edit / delete -----------------------------------------------------------------

	// Each opening of a dialog gets a new session number, so it starts with fresh content.
	let formOpen = $state(false);
	let formSession = $state(0);
	let editing: IconRecord | null = $state.raw(null);
	let formPreset: Partial<IconFormValues> = $state.raw({});
	let pictureNeeded = $state(false);

	/** Where focus goes when a dialog closes (see FocusReturn). */
	const focus = new FocusReturn({
		row: (id) => `li[data-icon="${id}"] [data-edit]`,
		group: (key) => `[data-group="${key}"] header button`,
		fallback: '[data-add-icon]'
	});
	/**
	 * Call when a dialog opens for `icon` (null: adding). An icon with several uses has a row in
	 * each of their groups: the neighbours are taken from the group it was opened from (the one
	 * holding the focused button), else from its first group.
	 */
	function rememberFocus(icon: IconRecord | null) {
		if (!icon) {
			focus.remember([], null);
			return;
		}
		const opener = document.activeElement?.closest(`li[data-icon="${CSS.escape(icon.id)}"]`);
		const from = opener?.closest<HTMLElement>('[data-group]')?.dataset.group as
			GroupKey | undefined;
		const group =
			from ??
			(Object.keys(groups) as GroupKey[]).find((key) =>
				groups[key].some((item) => item.id === icon.id)
			);
		focus.remember(group ? withNeighbours(groups[group], icon.id) : [icon.id], group ?? null);
	}

	function openAdd(preset: Partial<IconFormValues> = {}) {
		rememberFocus(null);
		editing = null;
		formPreset = preset;
		pictureNeeded = false;
		formSession++;
		formOpen = true;
	}

	function openEdit(icon: IconRecord, preset: Partial<IconFormValues> = {}, needsPicture = false) {
		rememberFocus(icon);
		editing = icon;
		formPreset = preset;
		pictureNeeded = needsPicture;
		formSession++;
		formOpen = true;
	}

	function onSaved(icon: IconRecord, outcome: SaveOutcome) {
		formOpen = false;
		if (outcome === 'unchanged') {
			// `icon` is the copy the form started with: keep the list's (maybe newer) record.
			notices.show({ text: `No changes to save for ${icon.name}.`, tone: 'success' });
			return;
		}
		icons.upsert(icon);
		if (outcome === 'created') focus.ids = [icon.id];
		notices.show({
			text: outcome === 'created' ? `Added ${icon.name}.` : `Saved ${icon.name}.`,
			tone: 'success'
		});
	}

	let deleteOpen = $state(false);
	let deleteSession = $state(0);
	let deleteTarget: IconRecord | null = $state.raw(null);

	function openDelete(icon: IconRecord) {
		rememberFocus(icon);
		deleteTarget = icon;
		deleteSession++;
		deleteOpen = true;
	}

	function onDeleted(icon: IconRecord, uses: UseCounts | null, alreadyGone: boolean) {
		icons.remove(icon.id);
		deleteOpen = false;
		const parts = uses ? usageParts(uses) : [];
		notices.show({
			text: alreadyGone
				? `${icon.name} had already been deleted (in another window).`
				: parts.length > 0
					? `Deleted ${icon.name}. It was used by ${joinWords(parts)}.`
					: `Deleted ${icon.name}.`,
			tone: 'success'
		});
	}

	function onTurnOff(icon: IconRecord) {
		deleteOpen = false;
		turnOff(icon);
	}
</script>

<div class="mx-auto max-w-5xl space-y-4 px-4 pt-10 pb-28">
	<EditorHeader
		title="Icons"
		description="Pictures with a name and an emoji: guests pick one when they check in, and calendar observances can show one."
		live={icons.status === 'ready' ? icons.live : null}
	>
		{#snippet actions()}
			<button
				type="button"
				class="btn preset-filled-primary-500 px-5 py-3 text-lg"
				disabled={icons.status !== 'ready'}
				data-add-icon
				onclick={() => openAdd()}
			>
				<ImagePlus class="size-6" aria-hidden="true" />
				Add icon
			</button>
		{/snippet}
	</EditorHeader>

	{#if icons.status === 'ready' && icons.live === 'offline'}
		<OfflineNotice />
	{/if}

	{#if icons.status === 'loading'}
		<LoadingCard text="Loading icons…" />
	{:else if icons.status === 'error'}
		<LoadErrorCard
			title="Can't load the icons"
			message={icons.loadError}
			retrying={icons.retrying}
			onRetry={icons.load}
		/>
	{:else if icons.items.length === 0}
		<section class="card bg-surface-50-950 space-y-4 p-8 text-center shadow-lg">
			<h2 class="h3">No icons yet</h2>
			<p>
				An icon is a picture with a name and an emoji. Guests who visit the class pick one when they
				check in, and calendar observances can show one on the calendar.
			</p>
			<div class="flex flex-wrap justify-center gap-3">
				{#each USES as use, index (use.key)}
					<button
						type="button"
						class="btn {index === 0
							? 'preset-filled-primary-500'
							: 'preset-tonal-primary'} px-5 py-3 text-lg"
						onclick={() => openAdd({ [use.field]: true })}
					>
						<Plus class="size-6" aria-hidden="true" />
						{use.addLabel.replace(/^Add /, 'Add a ')}
					</button>
				{/each}
			</div>
		</section>
	{:else}
		{#each GROUPS as group (group.key)}
			{@const list = groups[group.key]}
			{#if group.key !== 'unused' || list.length > 0}
				<GroupSection
					key={group.key}
					title={group.title}
					description={group.description}
					count={list.length}
					empty={group.empty}
					addLabel={group.add?.label}
					onAdd={() => openAdd(group.add?.preset)}
				>
					{#each list as icon (icon.id)}
						<IconRow
							{icon}
							busy={busyFields(icon.id)}
							onToggle={(field, value) => setSwitch(icon, field, value)}
							onEdit={() => openEdit(icon)}
							onDelete={() => openDelete(icon)}
						/>
					{/each}
				</GroupSection>
			{/if}
		{/each}
	{/if}
</div>

<IconFormDialog
	open={formOpen}
	session={formSession}
	icon={editing}
	preset={formPreset}
	{pictureNeeded}
	{onSaved}
	onClose={() => (formOpen = false)}
	finalFocusEl={focus.target}
/>

<DeleteIconDialog
	open={deleteOpen}
	session={deleteSession}
	icon={deleteTarget}
	onClose={() => (deleteOpen = false)}
	{onDeleted}
	{onTurnOff}
	finalFocusEl={focus.target}
/>

<NoticeBar {notices} />
