<script lang="ts">
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import type { Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';

	interface Props {
		open: boolean;
		/** Escape, a click outside (when allowed) or a Dialog.CloseTrigger */
		onClose: () => void;
		role?: 'dialog' | 'alertdialog';
		/**
		 * Off for forms, so a stray click next to the dialog can't throw away what was typed.
		 * zag's default: on for dialogs, off for alert dialogs.
		 */
		closeOnInteractOutside?: boolean;
		/** zag's default: the first focusable element; for alert dialogs the Dialog.CloseTrigger. */
		initialFocusEl?: () => HTMLElement | null;
		class?: string;
		children: Snippet;
	}

	let {
		open,
		onClose,
		role = 'dialog',
		closeOnInteractOutside,
		initialFocusEl,
		class: className = '',
		children: content
	}: Props = $props();

	// Only pass the options that are set: an explicit undefined would replace zag's defaults.
	const options = $derived({
		...(closeOnInteractOutside !== undefined && { closeOnInteractOutside }),
		...(initialFocusEl && { initialFocusEl })
	});
</script>

<!--
	Skeleton's Dialog is headless: zag handles focus (trapped inside, given back on close), Escape,
	aria-modal and the labels from Dialog.Title / Dialog.Description; this supplies the look. The
	content only exists while the dialog is open, so every opening starts fresh.
-->
<Dialog
	{open}
	{role}
	{...options}
	onOpenChange={(details) => {
		if (!details.open) onClose();
	}}
>
	<Portal>
		<Dialog.Context>
			{#snippet children(dialog)}
				{#if dialog().open}
					<Dialog.Backdrop
						class="bg-surface-50/75 dark:bg-surface-950/75 fixed inset-0 z-[998] backdrop-blur-sm"
					>
						{#snippet element(attributes)}
							<div {...attributes} transition:fade|global={{ duration: 100 }}></div>
						{/snippet}
					</Dialog.Backdrop>
					<Dialog.Positioner class="fixed inset-0 z-[999] flex items-center justify-center p-4">
						{#snippet element(attributes)}
							<div {...attributes} transition:fly|global={{ y: 50, duration: 200 }}>
								<Dialog.Content
									class="card bg-surface-50-950 flex max-h-[calc(100dvh-2rem)] w-full flex-col shadow-xl {className}"
								>
									{@render content()}
								</Dialog.Content>
							</div>
						{/snippet}
					</Dialog.Positioner>
				{/if}
			{/snippet}
		</Dialog.Context>
	</Portal>
</Dialog>
