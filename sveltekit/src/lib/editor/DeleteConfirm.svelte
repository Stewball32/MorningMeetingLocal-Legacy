<!--
	@component
	The content of a delete confirmation (put it in an EditorDialog with role="alertdialog"), the
	pattern of the People editor:
	1. count what the delete affects when the dialog opens (`count`; Delete waits for it, but a
	   failed count doesn't block it);
	2. say so (`description`, given the count) and offer a gentler way out (`alternative`, e.g.
	   "Turn off instead"; it is told when a delete is under way, to disable its button);
	3. delete; "already deleted" (a 404, e.g. in another window) counts as done.

	It is created anew for each opening (EditorDialog's `session`), so the count is always fresh.
	Pass `bind:this` and use `canClose()` for EditorDialog: it stays open while deleting.
-->
<script lang="ts" generics="Counts">
	import { Dialog } from '@skeletonlabs/skeleton-svelte';
	import Trash from '@lucide/svelte/icons/trash-2';
	import { onMount, type Snippet } from 'svelte';
	import { describeError, type DescribeOptions } from './errors.ts';

	interface Props {
		/** The dialog's title, e.g. "Delete Bluey?" */
		title: string;
		/** Shown left of the title (e.g. the record's picture). */
		picture?: Snippet;
		/** Counts what the delete affects (once, when the dialog opens). */
		count?: () => Promise<Counts>;
		/** The explanation (inside Dialog.Description). `counts` is null while counting or if counting failed. */
		description: Snippet<[counts: Counts | null, countFailed: boolean]>;
		/** Shown between the explanation and the buttons; `busy`: a delete is under way. */
		alternative?: Snippet<[busy: boolean]>;
		/** Sends the delete. */
		remove: () => Promise<unknown>;
		/** Completes "Couldn't ..." on failure, e.g. "delete Bluey". */
		doing: string;
		/** For the error message (e.g. `{ noun: 'icon' }`). */
		errorOptions?: DescribeOptions;
		/** Done: deleted now (`alreadyGone` false), or it had already been deleted elsewhere. */
		onDeleted: (counts: Counts | null, alreadyGone: boolean) => void;
		/** The delete button's text. */
		deleteLabel?: string;
		/** The delete button's look; e.g. "preset-tonal-error" when the alternative is the main choice. */
		deleteClass?: string;
	}

	let {
		title,
		picture,
		count,
		description,
		alternative,
		remove,
		doing,
		errorOptions,
		onDeleted,
		deleteLabel = 'Delete permanently',
		deleteClass = 'preset-filled-error-500'
	}: Props = $props();

	let counts: Counts | null = $state(null);
	let countFailed = $state(false);
	/** A delete is on its way, or done (the dialog is then closing). */
	let deleting = $state(false);
	/** The delete request is on its way (the button says so; not while the dialog closes). */
	let sending = $state(false);
	let message = $state('');
	const counting = $derived(!!count && counts === null && !countFailed);

	onMount(() => {
		if (!count) return;
		let stale = false;
		count().then(
			(counted) => {
				if (!stale) counts = counted;
			},
			(error) => {
				console.error('Could not count what the delete affects', error);
				if (!stale) countFailed = true;
			}
		);
		return () => {
			stale = true;
		};
	});

	/** For EditorDialog's canClose: the dialog stays open while the delete is on its way. */
	export function canClose(): boolean {
		return !deleting;
	}

	async function confirmDelete() {
		if (deleting) return;
		deleting = true;
		message = '';
		sending = true;
		try {
			await remove();
			sending = false;
			onDeleted(counts, false);
		} catch (error) {
			sending = false;
			const problem = describeError(error, doing, errorOptions);
			if (problem.notFound) onDeleted(null, true);
			else {
				message = problem.message;
				deleting = false;
			}
		}
	}
</script>

<div class="min-h-0 space-y-4 overflow-y-auto p-6">
	<div class="flex items-center gap-4">
		{@render picture?.()}
		<Dialog.Title class="h4 min-w-0 break-words">{title}</Dialog.Title>
	</div>

	<Dialog.Description class="space-y-2">
		{@render description(counts, countFailed)}
	</Dialog.Description>

	{@render alternative?.(deleting)}

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
			class="btn {deleteClass} px-5 py-2"
			disabled={deleting || counting}
			onclick={confirmDelete}
		>
			<Trash class="size-5" aria-hidden="true" />
			{sending ? 'Deleting…' : deleteLabel}
		</button>
	</footer>
</div>
