<!--
	@component
	A palette of common emoji to click. It is one Tab stop (a toolbar): the arrow keys move between
	the emoji, Home and End go to the first and last, Enter or Space picks one.
-->
<script lang="ts">
	import { EMOJI_PALETTE } from './emoji.ts';

	interface Props {
		/** The emoji in the form (its button shows as chosen). */
		value: string;
		onPick: (emoji: string) => void;
		disabled?: boolean;
		/** Names the toolbar. */
		label?: string;
	}

	let { value, onPick, disabled = false, label = 'Common emoji' }: Props = $props();

	const chosen = $derived(EMOJI_PALETTE.findIndex((item) => item.emoji === value.trim()));
	/** The button that takes focus on Tab (the last one moved to, else the chosen one). */
	let moved: number | null = $state(null);
	const current = $derived(moved ?? (chosen >= 0 ? chosen : 0));

	function onKeyDown(event: KeyboardEvent & { currentTarget: HTMLElement }) {
		const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
		const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
		if (at < 0) return;
		// The palette wraps to the width it gets: a row is the buttons as high as the first one.
		const columns = Math.max(
			1,
			buttons.filter((button) => button.offsetTop === buttons[0].offsetTop).length
		);
		const last = buttons.length - 1;
		const next = {
			ArrowRight: Math.min(at + 1, last),
			ArrowLeft: Math.max(at - 1, 0),
			ArrowDown: at + columns <= last ? at + columns : at,
			ArrowUp: at - columns >= 0 ? at - columns : at,
			Home: 0,
			End: last
		}[event.key];
		if (next === undefined) return;
		event.preventDefault();
		moved = next;
		buttons[next].focus();
	}
</script>

<div
	role="toolbar"
	aria-label={label}
	tabindex="-1"
	class="flex flex-wrap gap-1"
	onkeydown={onKeyDown}
>
	{#each EMOJI_PALETTE as item, index (item.emoji)}
		<button
			type="button"
			class="btn-icon rounded-base hover:preset-tonal-primary size-10 text-2xl {index === chosen
				? 'preset-tonal-primary ring-primary-500 ring-2'
				: ''}"
			tabindex={index === current ? 0 : -1}
			title={item.name}
			aria-label={item.name}
			aria-pressed={index === chosen}
			{disabled}
			onclick={() => {
				moved = index;
				onPick(item.emoji);
			}}
		>
			{item.emoji}
		</button>
	{/each}
</div>
