<script lang="ts">
	import { Dialog } from '@skeletonlabs/skeleton-svelte';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import Trash from '@lucide/svelte/icons/trash-2';
	import { onMount } from 'svelte';
	import type { Person } from '#lib/pb/types.ts';
	import {
		countPersonHistory,
		deletePerson,
		personAvatarUrl,
		type PersonHistory
	} from '#lib/pb/people.ts';
	import { describeError } from './errors.ts';
	import PersonAvatar from './PersonAvatar.svelte';
	import { displayName, historyParts } from './people.ts';

	interface Props {
		person: Person;
		/** `history`: what was deleted with them (null if it couldn't be counted). */
		onDeleted: (person: Person, history: PersonHistory | null, alreadyGone: boolean) => void;
		onDeactivate: (person: Person) => void;
	}

	let { person, onDeleted, onDeactivate }: Props = $props();

	const name = $derived(displayName(person));

	let history: PersonHistory | null = $state(null);
	const parts = $derived(history ? historyParts(history) : []);
	let countFailed = $state(false);
	/** A delete is on its way, or done (the dialog is then closing). */
	let deleting = $state(false);
	/** The delete request is on its way (the button says so; not while the dialog closes). */
	let sending = $state(false);
	let message = $state('');

	// This is created anew each time the dialog opens, so the count is always fresh.
	onMount(() => {
		let stale = false;
		countPersonHistory(person.id).then(
			(counted) => {
				if (!stale) history = counted;
			},
			(error) => {
				console.error('Could not count the history', error);
				if (!stale) countFailed = true;
			}
		);
		return () => {
			stale = true;
		};
	});

	/** For Escape: the dialog stays open while the delete is on its way. */
	export function canClose(): boolean {
		return !deleting;
	}

	async function confirmDelete() {
		if (deleting) return;
		const target = person;
		deleting = true;
		message = '';
		sending = true;
		try {
			await deletePerson(target.id);
			sending = false;
			onDeleted(target, history, false);
		} catch (error) {
			sending = false;
			const problem = describeError(error, `delete ${displayName(target)}`);
			if (problem.notFound) onDeleted(target, null, true);
			else {
				message = problem.message;
				deleting = false;
			}
		}
	}
</script>

<div class="min-h-0 space-y-4 overflow-y-auto p-6">
	<div class="flex items-center gap-4">
		<PersonAvatar src={personAvatarUrl(person)} class="size-16" />
		<Dialog.Title class="h4 min-w-0 break-words">Delete {name}?</Dialog.Title>
	</div>

	<Dialog.Description class="space-y-2">
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
	</Dialog.Description>

	{#if person.active}
		<div class="card preset-tonal-warning space-y-3 p-4">
			<p>
				<strong class="font-semibold">Has {name} just left the class?</strong>
				Turn off Active instead: they disappear from the slides and their history is kept.
			</p>
			<button
				type="button"
				class="btn preset-filled-warning-500 px-4 py-2"
				disabled={deleting}
				onclick={() => onDeactivate(person)}
			>
				<EyeOff class="size-5" aria-hidden="true" />
				Turn off Active instead
			</button>
		</div>
	{:else}
		<p class="card preset-tonal p-4">
			{name} is already inactive, so the slides don't show them. Only delete them if you don't need their
			history.
		</p>
	{/if}

	{#if message}
		<p class="card preset-tonal-error px-3 py-2 text-sm font-semibold" role="alert">
			{message}
		</p>
	{/if}

	<footer class="flex flex-wrap justify-end gap-3 pt-2">
		<Dialog.CloseTrigger class="btn preset-tonal px-5 py-2" disabled={deleting}>
			Cancel
		</Dialog.CloseTrigger>
		<button
			type="button"
			class="btn preset-filled-error-500 px-5 py-2"
			disabled={deleting || (history === null && !countFailed)}
			onclick={confirmDelete}
		>
			<Trash class="size-5" aria-hidden="true" />
			{sending ? 'Deleting…' : 'Delete permanently'}
		</button>
	</footer>
</div>
