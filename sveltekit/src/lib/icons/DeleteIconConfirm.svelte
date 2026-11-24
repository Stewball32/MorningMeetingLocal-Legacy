<!--
	@component
	The content of the delete dialog for an icon: counts what uses it (guest check-ins, calendar
	observances: see USES) and says what deleting does to them. When anything uses it, "Turn off
	instead" is the main choice and "Delete anyway" the second; an icon nothing uses is just
	deleted.
-->
<script lang="ts">
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import DeleteConfirm from '#lib/editor/DeleteConfirm.svelte';
	import { countIconUses, deleteIcon, iconPictureUrl } from '#lib/pb/icons.ts';
	import type { IconRecord } from '#lib/pb/types.ts';
	import IconPicture from './IconPicture.svelte';
	import {
		afterDelete,
		DELETE_CLASH,
		ICON_ERRORS,
		isDeleteClash,
		joinWords,
		totalUses,
		usageParts
	} from './icons.ts';
	import { USES, usesOf, type UseCounts } from './uses.ts';

	interface Props {
		icon: IconRecord;
		/** `uses`: what used it (null if that couldn't be counted). */
		onDeleted: (icon: IconRecord, uses: UseCounts | null, alreadyGone: boolean) => void;
		onTurnOff: (icon: IconRecord) => void;
	}

	let { icon, onDeleted, onTurnOff }: Props = $props();

	const name = $derived(icon.name);
	/** The uses it is switched on for. */
	const onFor = $derived(usesOf(icon));
	const offeredFor = $derived(joinWords(onFor.map((use) => use.group.toLowerCase())));

	// DeleteConfirm counts; the buttons here change with the answer too.
	let counted: UseCounts | null = $state(null);
	let countFailed = $state(false);
	async function count(): Promise<UseCounts> {
		try {
			counted = await countIconUses(icon.id);
			return counted;
		} catch (error) {
			countFailed = true;
			throw error;
		}
	}
	/** Something may use it: nothing counted yet, or something counted. */
	const mayBeUsed = $derived(countFailed || (counted !== null && totalUses(counted) > 0));
	const offerTurnOff = $derived(mayBeUsed && onFor.length > 0);

	async function remove() {
		try {
			await deleteIcon(icon.id);
		} catch (error) {
			// Only on a PocketBase without the update for the Icons page (see isDeleteClash).
			if (isDeleteClash(error)) throw new Error(DELETE_CLASH, { cause: error });
			throw error;
		}
	}

	let confirm: ReturnType<typeof DeleteConfirm<UseCounts>> | undefined = $state();

	/** For Escape: the dialog stays open while the delete is on its way. */
	export function canClose(): boolean {
		return confirm?.canClose() ?? true;
	}
</script>

<DeleteConfirm
	bind:this={confirm}
	title="Delete {name}?"
	{count}
	{remove}
	doing="delete {name}"
	errorOptions={ICON_ERRORS}
	deleteLabel={mayBeUsed ? 'Delete anyway' : 'Delete'}
	deleteClass={offerTurnOff ? 'preset-tonal-error' : 'preset-filled-error-500'}
	onDeleted={(uses, alreadyGone) => onDeleted(icon, uses, alreadyGone)}
>
	{#snippet picture()}
		<IconPicture src={iconPictureUrl(icon)} class="size-16" />
	{/snippet}

	{#snippet description(uses, failed)}
		{@const parts = uses ? usageParts(uses) : []}
		<p aria-live="polite">
			{#if failed}
				What uses {name} couldn't be counted just now. If you delete it, {joinWords(
					afterDelete(null)
				)}.
			{:else if uses === null}
				Counting what uses {name}…
			{:else if parts.length === 0}
				No {joinWords(
					USES.map((use) => `${use.usedBy.thing}s`),
					'or'
				)} use {name}. This permanently deletes it and its picture{onFor.length > 0
					? `; it is then no longer offered ${offeredFor}`
					: ''}.
			{:else}
				{name} is used by
				{#each parts as part, index (part)}{index > 0 ? ' and ' : ''}<strong class="font-semibold">
						{part}
					</strong>{/each}. If you delete it, {joinWords(afterDelete(uses))}.
			{/if}
		</p>
		<p>This can't be undone.</p>
	{/snippet}

	{#snippet alternative(busy)}
		{#if offerTurnOff}
			<div class="card preset-tonal-warning space-y-3 p-4">
				<p>
					<strong class="font-semibold">Just want to stop offering it?</strong>
					Turn it off instead: it is no longer offered {offeredFor}, and everything that uses it
					keeps its picture.
				</p>
				<button
					type="button"
					class="btn preset-filled-warning-500 px-4 py-2"
					disabled={busy}
					onclick={() => onTurnOff(icon)}
				>
					<EyeOff class="size-5" aria-hidden="true" />
					Turn off instead
				</button>
			</div>
		{:else if mayBeUsed}
			<p class="card preset-tonal p-4">
				{name} is already turned off: it isn't offered for anything new, and everything that uses it keeps
				its picture. Only delete it if you don't need it any more.
			</p>
		{/if}
	{/snippet}
</DeleteConfirm>
