<!--
	@component
	The dialog every editor uses (forms and delete confirmations), styled like the People editor.
	Keep its content in its own component and give it a new `session` for each opening:

	```svelte
	<EditorDialog open={formOpen} session={formSession} onClose={() => (formOpen = false)}
		canClose={() => form?.canClose() ?? true} closeOnInteractOutside={false} class="max-w-3xl">
		<IconForm bind:this={form} ... />
	</EditorDialog>
	```

	Use `role="alertdialog"` for a delete confirmation (zag then focuses its Dialog.CloseTrigger,
	i.e. Cancel, and ignores clicks outside). Title the content with Dialog.Title.
-->
<script lang="ts">
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import type { Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';

	interface Props {
		open: boolean;
		/**
		 * A new value for every opening (e.g. a counter). The content is created anew for each, even
		 * when the dialog is opened again during its closing animation, which would otherwise bring
		 * back the previous content with whatever it held.
		 */
		session: number;
		/** Escape, a click outside (when allowed) or a Dialog.CloseTrigger */
		onClose: () => void;
		/** Asked when Escape is pressed: false keeps the dialog open (e.g. while saving). */
		canClose?: () => boolean;
		role?: 'dialog' | 'alertdialog';
		/**
		 * Off for forms, so a stray click next to the dialog can't throw away what was typed.
		 * zag's default: on for dialogs, off for alert dialogs.
		 */
		closeOnInteractOutside?: boolean;
		/** zag's default: the first focusable element; for alert dialogs the Dialog.CloseTrigger. */
		initialFocusEl?: () => HTMLElement | null;
		/**
		 * Where focus goes once the dialog has closed (asked at that moment). zag's default, used
		 * when this returns null, is the button that opened the dialog.
		 */
		finalFocusEl?: () => HTMLElement | null;
		class?: string;
		children: Snippet;
	}

	let {
		open,
		session,
		onClose,
		canClose,
		role = 'dialog',
		closeOnInteractOutside,
		initialFocusEl,
		finalFocusEl,
		class: className = '',
		children: content
	}: Props = $props();

	// Only pass the options that are set: an explicit undefined would replace zag's defaults.
	const options = $derived({
		...(closeOnInteractOutside !== undefined && { closeOnInteractOutside }),
		...(initialFocusEl && { initialFocusEl }),
		...(finalFocusEl && { finalFocusEl })
	});
</script>

<!--
	Skeleton's Dialog is headless: zag handles focus (trapped inside, given back on close), Escape,
	aria-modal and the labels from Dialog.Title / Dialog.Description; this supplies the look. The
	content is inert as soon as the dialog is closing, so a key pressed during the closing
	animation can't reach it.
-->
<Dialog
	{open}
	{role}
	{...options}
	onOpenChange={(details) => {
		if (!details.open) onClose();
	}}
	onEscapeKeyDown={(event) => {
		if (canClose && !canClose()) event.preventDefault();
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
							<div {...attributes} inert={!open} transition:fly|global={{ y: 50, duration: 200 }}>
								<Dialog.Content
									class="card bg-surface-50-950 flex max-h-[calc(100dvh-2rem)] w-full flex-col shadow-xl {className}"
								>
									{#key session}
										{@render content()}
									{/key}
								</Dialog.Content>
							</div>
						{/snippet}
					</Dialog.Positioner>
				{/if}
			{/snippet}
		</Dialog.Context>
	</Portal>
</Dialog>
