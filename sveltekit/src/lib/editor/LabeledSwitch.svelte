<!--
	@component
	A switch with its label, the whole label being the click target. In a list, pass `context`
	(e.g. the record's name) so screen readers hear whose switch it is, and `readOnly` while its
	change is being saved.
-->
<script lang="ts">
	import { Switch } from '@skeletonlabs/skeleton-svelte';

	interface Props {
		label: string;
		checked: boolean;
		onCheckedChange: (checked: boolean) => void;
		disabled?: boolean;
		/** Can't be flipped but stays focusable (e.g. while a change is being saved). */
		readOnly?: boolean;
		/** Read to screen readers after the label, e.g. whose switch this is in a list. */
		context?: string;
		/** id of an element that explains the switch */
		describedBy?: string;
		name?: string;
		class?: string;
	}

	let {
		label,
		checked,
		onCheckedChange,
		disabled = false,
		readOnly = false,
		context = '',
		describedBy,
		name,
		class: className = ''
	}: Props = $props();
</script>

<!-- The whole label (padding included) is the click target, not just the 40px pill. -->
<Switch
	{checked}
	{disabled}
	{readOnly}
	{name}
	onCheckedChange={(details) => onCheckedChange(details.checked)}
	class="hover:bg-surface-200-800 rounded-base cursor-pointer px-2 py-2 select-none {className}"
>
	<Switch.Control>
		<Switch.Thumb />
	</Switch.Control>
	<Switch.Label class="text-base font-normal">
		{label}{#if context}<span class="sr-only">{` (${context})`}</span>{/if}
	</Switch.Label>
	<Switch.HiddenInput aria-describedby={describedBy} />
</Switch>
