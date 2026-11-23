<script lang="ts">
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import Trash from '@lucide/svelte/icons/trash-2';
	import { onDestroy, onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import EditorHeader from '#lib/editor/EditorHeader.svelte';
	import { describeError } from '#lib/editor/errors.ts';
	import { FocusReturn } from '#lib/editor/focus.ts';
	import type { SaveOutcome } from '#lib/editor/form.ts';
	import GroupSection from '#lib/editor/GroupSection.svelte';
	import { plural, withNeighbours } from '#lib/editor/list.ts';
	import { LiveList } from '#lib/editor/live-list.svelte.ts';
	import LoadErrorCard from '#lib/editor/LoadErrorCard.svelte';
	import LoadingCard from '#lib/editor/LoadingCard.svelte';
	import NoticeBar from '#lib/editor/NoticeBar.svelte';
	import { Notices } from '#lib/editor/notices.svelte.ts';
	import OfflineNotice from '#lib/editor/OfflineNotice.svelte';
	import { dayLabel } from '#lib/home/summary.ts';
	import BuiltInHolidayRow from '#lib/observances/BuiltInHolidayRow.svelte';
	import { formatDay } from '#lib/observances/dates.ts';
	import DeleteObservanceDialog, {
		type DeleteTarget
	} from '#lib/observances/DeleteObservanceDialog.svelte';
	import { builtInOf, type FormPreset } from '#lib/observances/form.ts';
	import ObservanceFormDialog from '#lib/observances/ObservanceFormDialog.svelte';
	import ObservancePicture from '#lib/observances/ObservancePicture.svelte';
	import {
		builtInRows,
		comingUp,
		COMING_UP_DAYS,
		iconLookup,
		nextDayLabel,
		OBSERVANCE_ERRORS,
		ownGroups,
		schoolOf,
		scheduleText,
		schoolYear,
		settingsRecordsFor,
		slug,
		type BuiltInRow,
		type OwnRow
	} from '#lib/observances/observances.ts';
	import OwnObservanceRow from '#lib/observances/OwnObservanceRow.svelte';
	import SchoolBadge from '#lib/observances/SchoolBadge.svelte';
	import { builtInHolidays, observancePicture, type BuiltInHoliday } from '#lib/pb/calendar.ts';
	import {
		createObservance,
		ICONS,
		listIcons,
		listObservances,
		listSettingsRecords,
		OBSERVANCES,
		updateObservance
	} from '#lib/pb/observances.ts';
	import type { CalendarObservance, IconRecord } from '#lib/pb/types.ts';

	// --- Loading and live updates ------------------------------------------------------------

	const observances = new LiveList<CalendarObservance>({
		collection: OBSERVANCES,
		load: listObservances,
		doing: 'load the calendar observances',
		watch: { expand: 'icon' }
	});
	// For the pictures and the icon picker (an icon's new picture shows up right away).
	const icons = new LiveList<IconRecord>({
		collection: ICONS,
		load: listIcons,
		doing: 'load the icons'
	});
	const notices = new Notices();

	/** Today, kept up to date if the page stays open overnight. */
	let today = $state(new Date());
	let dayTimer: ReturnType<typeof setInterval> | undefined;

	onMount(() => {
		observances.start();
		icons.start();
		dayTimer = setInterval(() => {
			const now = new Date();
			if (now.toDateString() !== today.toDateString()) today = now;
		}, 60_000);
	});
	onDestroy(() => {
		observances.stop();
		icons.stop();
		notices.destroy();
		clearInterval(dayTimer);
	});

	const live = $derived.by(() => {
		if (observances.status !== 'ready') return null;
		const states = [observances.live, icons.live];
		if (states.includes('offline')) return 'offline';
		return states.includes('connecting') ? 'connecting' : 'live';
	});

	/** Every built-in holiday (from date-holidays; Election Day only comes every 4 years). */
	const holidays = $derived(builtInHolidays(today.getFullYear() - 1, 10));
	const iconOf = $derived(iconLookup(icons.items));
	const pictureOf = (record: CalendarObservance) => observancePicture(record, iconOf(record));
	const coming = $derived(comingUp(observances.items, today, iconOf));
	const own = $derived(ownGroups(observances.items, holidays, today));
	const builtIns = $derived(builtInRows(holidays, observances.items, today, iconOf));
	const year = $derived(schoolYear(today));

	// --- Switches and Hide / Show --------------------------------------------------------------

	const pending = new SvelteSet<string>();
	const nameOf = (record: CalendarObservance) => record.name?.trim() || '(no name)';

	async function setActive(record: CalendarObservance, value: boolean, undoable = true) {
		const key = `${record.id}:active`;
		if (pending.has(key)) return;
		pending.add(key);
		const name = nameOf(record);
		const settings = builtInOf(record, holidays);
		// Move the switch right away; put it back if the save fails.
		const before = observances.find(record.id) ?? record;
		observances.upsert({ ...before, is_active: value });
		try {
			const saved = await updateObservance(record.id, { is_active: value });
			observances.upsert(saved);
			notices.show({
				text: settings
					? value
						? `Your changes to ${settings.name} are used again.`
						: `Your changes to ${settings.name} are off.`
					: value
						? `${name} is on the calendar again.`
						: `${name} is no longer on the calendar (it stays here).`,
				tone: 'success',
				undo: undoable ? () => setActive(saved, !value, false) : undefined
			});
		} catch (error) {
			const problem = describeError(error, `change ${name}`, OBSERVANCE_ERRORS);
			const current = observances.find(record.id);
			if (problem.notFound) observances.remove(record.id);
			else if (current) observances.upsert({ ...current, is_active: !value });
			notices.show({ text: problem.message, tone: 'error' });
		} finally {
			pending.delete(key);
		}
	}

	async function setHidden(holiday: BuiltInHoliday, hidden: boolean, undoable = true) {
		const key = `builtin:${holiday.name}`;
		if (pending.has(key)) return;
		pending.add(key);
		let record: CalendarObservance | undefined;
		try {
			record = settingsRecordsFor(observances.items, holiday.name)[0];
			if (!record && !hidden) {
				// No changes, so nothing hides it (e.g. they were reset in another window).
				notices.show({ text: `${holiday.name} is already on the calendar.`, tone: 'success' });
				return;
			}
			// One set of changes per holiday: check PocketBase itself before making one.
			if (!record) record = settingsRecordsFor(await listSettingsRecords(), holiday.name)[0];
			// Hide and Show only change `hidden`: it hides the holiday whether or not the record's
			// other changes ("Use these changes") are on, so Show can't switch old changes back on.
			const saved = record
				? await updateObservance(record.id, { hidden })
				: await createObservance({
						name: holiday.name,
						dates: [],
						school: holiday.school,
						description: '',
						is_active: true,
						hidden,
						icon: ''
					});
			observances.upsert(saved);
			notices.show({
				text: hidden
					? `${holiday.name} is hidden: it isn't on the calendar any more.`
					: saved.is_active
						? `${holiday.name} is back on the calendar.`
						: `${holiday.name} is back on the calendar (your changes to it stay off).`,
				tone: 'success',
				undo: undoable ? () => setHidden(holiday, !hidden, false) : undefined
			});
		} catch (error) {
			const problem = describeError(
				error,
				`${hidden ? 'hide' : 'show'} ${holiday.name}`,
				OBSERVANCE_ERRORS
			);
			if (problem.notFound && record) observances.remove(record.id);
			// Its changes were just deleted elsewhere: with none, nothing hides it.
			if (problem.notFound && !hidden)
				notices.show({ text: `${holiday.name} is already on the calendar.`, tone: 'success' });
			else notices.show({ text: problem.message, tone: 'error' });
		} finally {
			pending.delete(key);
		}
	}

	// --- Add / edit / delete -------------------------------------------------------------------

	// Each opening of a dialog gets a new session number, so it starts with fresh content.
	let formOpen = $state(false);
	let formSession = $state(0);
	let editing: CalendarObservance | null = $state.raw(null);
	let formPreset: FormPreset = $state.raw({});

	const builtInId = (key: string) => `builtin:${key}`;
	/** Where focus goes when a dialog closes (see FocusReturn). */
	const focus = new FocusReturn({
		row: (id) =>
			id.startsWith('builtin:')
				? `li[data-builtin="${id.slice('builtin:'.length)}"] [data-customize]`
				: `li[data-observance="${id}"] [data-edit]`,
		group: (key) => `[data-group="${key}"] header button`,
		fallback: '[data-add-observance]'
	});
	function rememberRecord(record: CalendarObservance | null) {
		if (!record) return focus.remember([], null);
		const holiday = builtInOf(record, holidays);
		if (holiday && settingsRecordsFor(observances.items, holiday.name)[0]?.id === record.id)
			return rememberBuiltIn(slug(holiday.name));
		const groups: [string, { record: CalendarObservance }[]][] = [
			['own', own.upcoming],
			['past', own.past],
			['attention', own.attention]
		];
		const [group, list] = groups.find(([, rows]) =>
			rows.some((r) => r.record.id === record.id)
		) ?? ['own', []];
		focus.remember(
			withNeighbours(
				list.map((row) => row.record),
				record.id
			),
			group
		);
	}
	function rememberBuiltIn(key: string) {
		const ids = builtIns.map((row) => ({ id: builtInId(row.key) }));
		focus.remember(withNeighbours(ids, builtInId(key)), 'builtin');
	}

	function openAdd(preset: FormPreset = {}) {
		if (preset.holiday) rememberBuiltIn(slug(preset.holiday));
		else rememberRecord(null);
		editing = null;
		formPreset = preset;
		formSession++;
		formOpen = true;
	}

	function openEdit(record: CalendarObservance) {
		rememberRecord(record);
		editing = record;
		formPreset = {};
		formSession++;
		formOpen = true;
	}

	/** From the form: the chosen holiday already has changes, so edit those instead. */
	function editOther(record: CalendarObservance) {
		editing = observances.find(record.id) ?? record;
		formPreset = {};
		formSession++;
	}

	function customize(row: BuiltInRow) {
		if (row.record) {
			rememberBuiltIn(row.key);
			editing = row.record;
			formPreset = {};
			formSession++;
			formOpen = true;
		} else openAdd({ kind: 'builtin', holiday: row.holiday.name });
	}

	function onSaved(record: CalendarObservance, outcome: SaveOutcome) {
		formOpen = false;
		const holiday = builtInOf(record, holidays);
		const name = holiday?.name ?? nameOf(record);
		if (outcome === 'unchanged') {
			// `record` is the copy the form started with: keep the list's (maybe newer) record.
			notices.show({ text: `No changes to save for ${name}.`, tone: 'success' });
			return;
		}
		observances.upsert(record);
		focus.ids = [holiday ? builtInId(slug(holiday.name)) : record.id];
		notices.show({
			text: holiday
				? `Saved your changes to ${holiday.name}.`
				: outcome === 'created'
					? `Added ${name}.`
					: `Saved ${name}.`,
			tone: 'success'
		});
	}

	let deleteOpen = $state(false);
	let deleteSession = $state(0);
	let deleteTarget: DeleteTarget | null = $state.raw(null);

	function openDelete(target: DeleteTarget) {
		if (target.kind === 'record') rememberRecord(target.record);
		else if (target.kind === 'reset') rememberBuiltIn(slug(target.holiday.name));
		else focus.remember([], 'own');
		deleteTarget = target;
		deleteSession++;
		deleteOpen = true;
	}

	function onDeleted(target: DeleteTarget, alreadyGone: boolean) {
		deleteOpen = false;
		const records = target.kind === 'record' ? [target.record] : target.records;
		for (const record of records) observances.remove(record.id);
		notices.show({
			text:
				target.kind === 'reset'
					? `${target.holiday.name} is back to how it comes: the default picture, ${target.holiday.school === 'none' ? 'no school' : 'a regular day'}.`
					: target.kind === 'past'
						? `Deleted ${plural(records.length, 'past observance')}.`
						: alreadyGone
							? `${nameOf(target.record)} had already been deleted (in another window).`
							: `Deleted ${nameOf(target.record)}.`,
			tone: 'success'
		});
	}

	function onTurnOff(record: CalendarObservance) {
		deleteOpen = false;
		const current = observances.find(record.id) ?? record;
		if (current.is_active) setActive(current, false);
	}

	/** "next: Tomorrow" / "next: Thu, Nov 26" when its days don't already say so (one day only). */
	const nextText = (row: OwnRow) =>
		row.next && (row.entries.length > 1 || row.entries[0]?.kind !== 'once')
			? `next: ${nextDayLabel(row.next, today)}`
			: '';
	const unreadableText = (row: OwnRow) =>
		row.unreadable > 0
			? `${plural(row.unreadable, 'day was', 'days were')} saved outside this editor in a form the calendar can't read, so it doesn't show ${row.unreadable === 1 ? 'it' : 'them'}. Fix or remove ${row.unreadable === 1 ? 'it' : 'them'} with Edit.`
			: '';
</script>

<div class="mx-auto max-w-5xl space-y-4 px-4 pt-10 pb-28">
	<EditorHeader
		title="Calendar Observances"
		description="The days the calendar slide marks: built-in holidays and your own days, with their picture and school day."
		{live}
	>
		{#snippet actions()}
			<button
				type="button"
				class="btn preset-filled-primary-500 px-5 py-3 text-lg"
				disabled={observances.status !== 'ready'}
				data-add-observance
				onclick={() => openAdd()}
			>
				<CalendarPlus class="size-6" aria-hidden="true" />
				Add a day
			</button>
		{/snippet}
	</EditorHeader>

	{#if observances.status === 'ready' && live === 'offline'}
		<OfflineNotice />
	{/if}

	{#if observances.status === 'loading'}
		<LoadingCard text="Loading the calendar…" />
	{:else if observances.status === 'error'}
		<LoadErrorCard
			title="Can't load the calendar observances"
			message={observances.loadError}
			retrying={observances.retrying}
			onRetry={observances.load}
		/>
	{:else}
		<GroupSection
			key="coming"
			title="Coming up"
			description="What the calendar slide shows in the next {COMING_UP_DAYS} days."
			count={coming.length}
			empty="Nothing on the calendar in the next {COMING_UP_DAYS} days."
		>
			{#each coming as day (day.date.getTime())}
				<li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-2" data-coming>
					<span class="w-32 shrink-0 font-semibold" title={formatDay(day.date)}>
						{dayLabel(day.date, today)}
					</span>
					<span class="flex min-w-40 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
						{#each day.observances as observance, index (index)}
							<span class="flex items-center gap-2">
								<ObservancePicture src={observance.image} class="size-10" />
								<span>{observance.name}</span>
							</span>
						{/each}
					</span>
					<SchoolBadge school={day.school} />
				</li>
			{/each}
		</GroupSection>

		<GroupSection
			key="own"
			title="Your observances"
			description="Days you added, one-time or every year, soonest first."
			count={own.upcoming.length}
			empty={own.past.length > 0
				? 'None coming up. Add a day for a Minimum Day, a field trip or a class birthday.'
				: 'No days of your own yet. Add one for a Minimum Day, a field trip or a class birthday.'}
			addLabel="Add a day"
			onAdd={() => openAdd()}
		>
			{#each own.upcoming as row (row.record.id)}
				<OwnObservanceRow
					record={row.record}
					picture={pictureOf(row.record)}
					schedule={scheduleText(row.entries)}
					next={nextText(row)}
					school={schoolOf(row.record.school)}
					warning={unreadableText(row)}
					switchLabel="Show on the calendar"
					busy={pending.has(`${row.record.id}:active`)}
					onToggle={(value) => setActive(row.record, value)}
					onEdit={() => openEdit(row.record)}
					onDelete={() =>
						openDelete({ kind: 'record', record: row.record, picture: pictureOf(row.record) })}
				/>
			{/each}
		</GroupSection>

		{#if own.past.length > 0}
			<details class="card bg-surface-50-950 p-4 shadow-lg" data-group="past">
				<summary class="cursor-pointer">
					<span class="h4 inline-flex items-center gap-2">
						Past observances
						<span class="preset-tonal rounded-full px-2.5 text-base">{own.past.length}</span>
					</span>
					<span class="block text-sm opacity-80">
						One-time days that have all passed. The calendar doesn't show them any more: delete them
						to tidy up.
					</span>
				</summary>
				<div class="border-surface-200-800 mt-3 border-t pt-3">
					<button
						type="button"
						class="btn preset-tonal-error px-4 py-2"
						onclick={() => openDelete({ kind: 'past', records: own.past.map((row) => row.record) })}
					>
						<Trash class="size-5" aria-hidden="true" />
						Delete all {plural(own.past.length, 'past observance')}
					</button>
					<ul class="divide-surface-200-800 divide-y">
						{#each own.past as row (row.record.id)}
							<OwnObservanceRow
								record={row.record}
								picture={pictureOf(row.record)}
								schedule={scheduleText(row.entries)}
								school={schoolOf(row.record.school)}
								onToggle={(value) => setActive(row.record, value)}
								onEdit={() => openEdit(row.record)}
								onDelete={() =>
									openDelete({
										kind: 'record',
										record: row.record,
										picture: pictureOf(row.record)
									})}
							/>
						{/each}
					</ul>
				</div>
			</details>
		{/if}

		{#if own.attention.length > 0}
			<GroupSection
				key="attention"
				title="Not on the calendar"
				description="Records (made outside this editor) that the calendar ignores or adds up. Edit them, or delete them."
				count={own.attention.length}
				empty=""
			>
				{#each own.attention as row (row.record.id)}
					{@const holiday = builtInOf(row.record, holidays)}
					<OwnObservanceRow
						record={row.record}
						picture={pictureOf(row.record)}
						schedule={holiday ? `Changes to ${holiday.name}` : 'No days'}
						school={schoolOf(row.record.school, holiday?.school)}
						warning={row.reason}
						switchLabel={holiday ? 'Use these changes' : undefined}
						busy={pending.has(`${row.record.id}:active`)}
						onToggle={(value) => setActive(row.record, value)}
						onEdit={() => openEdit(row.record)}
						onDelete={() =>
							openDelete({ kind: 'record', record: row.record, picture: pictureOf(row.record) })}
					/>
				{/each}
			</GroupSection>
		{/if}

		<GroupSection
			key="builtin"
			title="Built-in holidays"
			description="US holidays the calendar shows by itself, with their dates in the {year.label} school year (August to July). Customize one to give it a picture or change its school day, or hide it."
			count={builtIns.length}
			empty=""
		>
			{#each builtIns as row (row.key)}
				<BuiltInHolidayRow
					{row}
					{today}
					busy={pending.has(`builtin:${row.holiday.name}`)}
					onCustomize={() => customize(row)}
					onHide={(hidden) => setHidden(row.holiday, hidden)}
					onReset={() =>
						openDelete({
							kind: 'reset',
							holiday: row.holiday,
							records: row.record ? [row.record, ...row.extra] : [],
							picture: row.picture
						})}
				/>
			{/each}
		</GroupSection>
	{/if}
</div>

<ObservanceFormDialog
	open={formOpen}
	session={formSession}
	record={editing}
	preset={formPreset}
	records={observances.items}
	icons={icons.items}
	iconsStatus={icons.status}
	{holidays}
	{today}
	{onSaved}
	onClose={() => (formOpen = false)}
	onEditOther={editOther}
	finalFocusEl={focus.target}
/>

<DeleteObservanceDialog
	open={deleteOpen}
	session={deleteSession}
	target={deleteTarget}
	onClose={() => (deleteOpen = false)}
	{onDeleted}
	{onTurnOff}
	finalFocusEl={focus.target}
/>

<NoticeBar {notices} />
