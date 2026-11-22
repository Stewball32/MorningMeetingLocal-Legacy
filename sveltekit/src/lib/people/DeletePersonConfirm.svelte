<script lang="ts">
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import DeleteConfirm from '#lib/editor/DeleteConfirm.svelte';
	import type { Person } from '#lib/pb/types.ts';
	import {
		countPersonHistory,
		deletePerson,
		personAvatarUrl,
		type PersonHistory
	} from '#lib/pb/people.ts';
	import PersonAvatar from './PersonAvatar.svelte';
	import { displayName, historyParts, PERSON_ERRORS } from './people.ts';

	interface Props {
		person: Person;
		/** `history`: what was deleted with them (null if it couldn't be counted). */
		onDeleted: (person: Person, history: PersonHistory | null, alreadyGone: boolean) => void;
		onDeactivate: (person: Person) => void;
	}

	let { person, onDeleted, onDeactivate }: Props = $props();

	const name = $derived(displayName(person));

	let confirm: ReturnType<typeof DeleteConfirm<PersonHistory>> | undefined = $state();

	/** For Escape: the dialog stays open while the delete is on its way. */
	export function canClose(): boolean {
		return confirm?.canClose() ?? true;
	}
</script>

<DeleteConfirm
	bind:this={confirm}
	title="Delete {name}?"
	count={() => countPersonHistory(person.id)}
	remove={() => deletePerson(person.id)}
	doing="delete {name}"
	errorOptions={PERSON_ERRORS}
	onDeleted={(history, alreadyGone) => onDeleted(person, history, alreadyGone)}
>
	{#snippet picture()}
		<PersonAvatar src={personAvatarUrl(person)} class="size-16" />
	{/snippet}

	{#snippet description(history, countFailed)}
		{@const parts = history ? historyParts(history) : []}
		<p aria-live="polite">
			{#if countFailed}
				This permanently deletes {name} and all of their attendance history and guest check-ins (they
				couldn't be counted just now).
			{:else if history === null}
				Counting {name}'s attendance history…
			{:else if parts.length === 0}
				This permanently deletes {name}. They have no attendance history yet.
			{:else}
				This permanently deletes {name} and
				{#each parts as part, index (part)}{index > 0 ? ' and ' : ''}<strong class="font-semibold">
						{part}
					</strong>{/each}.
			{/if}
		</p>
		<p>This can't be undone.</p>
	{/snippet}

	{#snippet alternative(busy)}
		{#if person.active}
			<div class="card preset-tonal-warning space-y-3 p-4">
				<p>
					<strong class="font-semibold">Has {name} just left the class?</strong>
					Turn off Active instead: they disappear from the slides and their history is kept.
				</p>
				<button
					type="button"
					class="btn preset-filled-warning-500 px-4 py-2"
					disabled={busy}
					onclick={() => onDeactivate(person)}
				>
					<EyeOff class="size-5" aria-hidden="true" />
					Turn off Active instead
				</button>
			</div>
		{:else}
			<p class="card preset-tonal p-4">
				{name} is already inactive, so the slides don't show them. Only delete them if you don't need
				their history.
			</p>
		{/if}
	{/snippet}
</DeleteConfirm>
