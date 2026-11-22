<script lang="ts">
	import { getGuestAvatar } from '#lib/pb/index.ts';
	import type { IconRecord, GuestDaily, Person } from '#lib/pb/types.ts';
	import { guestDisplayName, guestPictureUrl } from '#lib/slides/people.ts';
	import { onMount } from 'svelte';
	import Button from './+button.svelte';

	interface Props {
		guest: GuestDaily;
		person?: Person; // the regular guest this check-in belongs to (guest.person)
		orientation?: 'horizontal' | 'vertical';
		buttonClass?: string;
		avatarClass?: string;
		nameClass?: string;
		showAvatar?: boolean;
		showName?: boolean;
		buttonPreset?:
			| 'primary'
			| 'secondary'
			| 'tertiary'
			| 'success'
			| 'warning'
			| 'error'
			| 'surface';
		overrideButtonClass?: boolean;
		overrideAvatarClass?: boolean;
		overrideNameClass?: boolean;
		disableButton?: boolean;
		guestAvatarMap?: Map<string, IconRecord>;
		onClick?: () => void;
	}

	const {
		guest: guest,
		person,
		orientation = 'horizontal',
		buttonClass = '',
		avatarClass = '',
		nameClass = '',
		showAvatar = true,
		showName = true,
		buttonPreset,
		overrideButtonClass,
		overrideAvatarClass,
		overrideNameClass,
		disableButton,
		guestAvatarMap,
		onClick
	}: Props = $props();

	let avatarRecord = $state<IconRecord | null>(null);
	onMount(async () => {
		if (guestAvatarMap && guestAvatarMap.has(guest.avatar)) {
			avatarRecord = guestAvatarMap.get(guest.avatar) || null;
		} else if (guest.avatar) {
			avatarRecord = await getGuestAvatar(guest.avatar);
		}
		// no icon ('') is fine: a regular guest with their own picture is checked in without one
		if (guest.avatar && !avatarRecord) {
			console.warn('Avatar not found for guest:', guest.avatar);
		}
	});

	// the person's own picture, else the icon picked at check-in, else the default avatar
	let imageUrl = $derived(guestPictureUrl(person, avatarRecord));
	// a regular guest's current name and title, else the name saved at check-in
	let text = $derived(guestDisplayName(guest, person));
	let imgAlt = $derived(text);
</script>

<Button
	{imageUrl}
	{text}
	{imgAlt}
	{orientation}
	{buttonPreset}
	{buttonClass}
	imageClass={avatarClass}
	textClass={nameClass}
	{overrideButtonClass}
	showImage={showAvatar}
	overrideImageClass={overrideAvatarClass}
	showText={showName}
	overrideTextClass={overrideNameClass}
	disable={disableButton}
	{onClick}
/>
