<!--
	@component
	One icon in the list: its picture, emoji and name, a switch for each use (see USES), Edit and
	Delete. Its inputs are named after the use's field (e.g. "for_guests"), which keepSwitchFocus
	uses to find the same switch again when the row moves to another group.
-->
<script lang="ts">
	import ImageOff from '@lucide/svelte/icons/image-off';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash from '@lucide/svelte/icons/trash-2';
	import LabeledSwitch from '#lib/editor/LabeledSwitch.svelte';
	import { iconPictureUrl } from '#lib/pb/icons.ts';
	import type { IconRecord } from '#lib/pb/types.ts';
	import IconPicture from './IconPicture.svelte';
	import { needsPicture } from './icons.ts';
	import { USES, type UseField } from './uses.ts';

	interface Props {
		icon: IconRecord;
		/** Switches with a save on its way (they can't be flipped meanwhile). */
		busy?: readonly UseField[];
		onToggle: (field: UseField, value: boolean) => void;
		onEdit: () => void;
		onDelete: () => void;
	}

	let { icon, busy = [], onToggle, onEdit, onDelete }: Props = $props();

	const tag = 'rounded-full px-2.5 py-0.5 text-sm';
	const offForAll = $derived(USES.every((use) => !icon[use.field]));
</script>

<li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3" data-icon={icon.id}>
	<div class="flex items-center gap-3">
		<IconPicture
			src={iconPictureUrl(icon, '100x100')}
			class="size-16 {offForAll ? 'opacity-60 grayscale' : ''}"
		/>
		<span class="w-12 text-center text-4xl leading-none">{icon.emoji}</span>
	</div>
	<div class="min-w-40 flex-1">
		<p class="truncate text-xl font-semibold" title={icon.name}>{icon.name}</p>
		{#if !icon.image}
			<p class="mt-1 flex flex-wrap items-center gap-1.5">
				{#if needsPicture(icon)}
					<span class="{tag} preset-tonal-warning inline-flex items-center gap-1">
						<ImageOff class="size-4" aria-hidden="true" /> no picture: guests need one
					</span>
				{:else}
					<span class="{tag} preset-tonal inline-flex items-center gap-1 opacity-80">
						<ImageOff class="size-4" aria-hidden="true" /> no picture
					</span>
				{/if}
			</p>
		{/if}
	</div>
	<div class="flex flex-wrap items-center gap-1">
		{#each USES as use (use.key)}
			<LabeledSwitch
				label={use.label}
				name={use.field}
				context={icon.name}
				checked={icon[use.field]}
				readOnly={busy.includes(use.field)}
				onCheckedChange={(value) => onToggle(use.field, value)}
			/>
		{/each}
	</div>
	<div class="flex items-center gap-2">
		<!-- The space is in the expression: Svelte drops one at the start of an element ("EditRocket"). -->
		<button type="button" class="btn preset-tonal-primary px-4 py-2" data-edit onclick={onEdit}>
			<Pencil class="size-5" aria-hidden="true" />
			Edit<span class="sr-only">{` ${icon.name}`}</span>
		</button>
		<button type="button" class="btn preset-tonal-error px-4 py-2" onclick={onDelete}>
			<Trash class="size-5" aria-hidden="true" />
			Delete<span class="sr-only">{` ${icon.name}`}</span>
		</button>
	</div>
</li>
