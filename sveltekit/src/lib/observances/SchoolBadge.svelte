<!--
	@component
	The slide's badge for a school day, in the editor's words: "No school" or "Short day" (nothing
	on a regular day, unless `showRegular`).
-->
<script lang="ts">
	import type { School } from '#lib/pb/calendar.ts';
	import { SCHOOL_LABEL } from './observances.ts';

	interface Props {
		school: School;
		/** Also show "Regular day". */
		showRegular?: boolean;
		class?: string;
	}

	let { school, showRegular = false, class: className = '' }: Props = $props();

	const PRESET: Record<School, string> = {
		none: 'preset-filled-error-500',
		short: 'preset-filled-warning-500',
		full: 'preset-tonal'
	};
</script>

{#if school !== 'full' || showRegular}
	<span
		class="{PRESET[
			school
		]} rounded-full px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap {className}"
	>
		{SCHOOL_LABEL[school]}
	</span>
{/if}
