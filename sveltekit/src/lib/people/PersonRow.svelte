<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash from '@lucide/svelte/icons/trash-2';
	import Video from '@lucide/svelte/icons/video';
	import VideoOff from '@lucide/svelte/icons/video-off';
	import type { Person } from '#lib/pb/types.ts';
	import { personAvatarUrl } from '#lib/pb/people.ts';
	import LabeledSwitch from './LabeledSwitch.svelte';
	import PersonAvatar from './PersonAvatar.svelte';
	import { displayName, pronounLabel, roleLabel, type Flag } from './people.ts';

	interface Props {
		person: Person;
		/** Flags with a save in flight (their switch can't be flipped meanwhile). */
		busy?: readonly Flag[];
		onToggle: (flag: Flag, value: boolean) => void;
		onEdit: () => void;
		onDelete: () => void;
	}

	let { person, busy = [], onToggle, onEdit, onDelete }: Props = $props();

	const name = $derived(displayName(person));
	const tag = 'rounded-full px-2.5 py-0.5 text-sm';
</script>

<li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3" data-person={person.id}>
	<PersonAvatar
		src={personAvatarUrl(person)}
		class="size-16 {person.active ? '' : 'opacity-60 grayscale'}"
	/>
	<div class="min-w-40 flex-1">
		<p class="truncate text-xl font-semibold" title={name}>{name}</p>
		<p class="mt-1 flex flex-wrap items-center gap-1.5">
			<span class="{tag} preset-tonal">{roleLabel(person.role)}</span>
			<span class="{tag} preset-tonal">{pronounLabel(person.pronoun)}</span>
			{#if person.video_id}
				<span class="{tag} preset-tonal-success inline-flex items-center gap-1">
					<Video class="size-4" aria-hidden="true" /> video
				</span>
			{:else}
				<span class="{tag} preset-tonal inline-flex items-center gap-1 opacity-70">
					<VideoOff class="size-4" aria-hidden="true" /> no video
				</span>
			{/if}
		</p>
	</div>
	<div class="flex flex-wrap items-center gap-1">
		<LabeledSwitch
			label="Active"
			context={name}
			checked={person.active}
			readOnly={busy.includes('active')}
			onCheckedChange={(value) => onToggle('active', value)}
		/>
		<LabeledSwitch
			label="Guest"
			context={name}
			checked={person.is_guest}
			readOnly={busy.includes('is_guest')}
			onCheckedChange={(value) => onToggle('is_guest', value)}
		/>
	</div>
	<div class="flex items-center gap-2">
		<button type="button" class="btn preset-tonal-primary px-4 py-2" onclick={onEdit}>
			<Pencil class="size-5" aria-hidden="true" />
			Edit<span class="sr-only"> {name}</span>
		</button>
		<button type="button" class="btn preset-tonal-error px-4 py-2" onclick={onDelete}>
			<Trash class="size-5" aria-hidden="true" />
			Delete<span class="sr-only"> {name}</span>
		</button>
	</div>
</li>
