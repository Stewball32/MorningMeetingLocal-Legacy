<script lang="ts">
	import type { IconRecord, GuestDaily, Person } from '#lib/pb/types.ts';
	import {
		checkedInPeople,
		guestCheckInError,
		guestDisplayName,
		guestIconOptions,
		guestNameOptions,
		guestPerson,
		guestPictureUrl,
		regularGuestProblem,
		SMALL_PICTURE,
		type GuestNameOption
	} from '#lib/slides/people.ts';
	import { reportSaveError } from '#lib/present/saveStatus.svelte.ts';
	import { releaseVideoFocus, youtubeEmbedUrl } from './video.ts';
	import { displayName } from '#lib/people/people.ts';
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { ClassProps } from './_types';
	import {
		Combobox,
		Dialog,
		Popover,
		Portal,
		useListCollection
	} from '@skeletonlabs/skeleton-svelte';
	import Undo from '@lucide/svelte/icons/undo';
	import UserRoundPlus from '@lucide/svelte/icons/user-round-plus';
	import Trash from '@lucide/svelte/icons/trash-2';
	import TvMinimalPlay from '@lucide/svelte/icons/tv-minimal-play';
	import {
		createGuestDaily,
		deleteGuestDaily,
		getGuestDailiesRange,
		getPbImageUrl
	} from '#lib/pb/index.ts';
	import GuestButton from '#lib/buttons/GuestButton.svelte';
	import SampleButton from '#lib/buttons/+button.svelte';
	import NamePicture from './NamePicture.svelte';
	// the Delete Guest popover is scaled with the slide; the Add Guest dialog stays on <body>
	import StagePortal from '#lib/slides/StagePortal.svelte';

	interface GuestCheckProps {
		hasGuests?: boolean;
		guestDailies?: GuestDaily[];
		welcomeGuests?: boolean;
		guestAvatarMap?: Map<string, IconRecord>;
		guestPeople?: Person[]; // regular guests (active is_guest people), offered first by name
		peopleById?: Map<string, Person>; // everyone, for the people guest check-ins belong to
		pageLeft: () => void;
		pageRight: () => void;
		updateClassDailySlide: (
			column: string,
			partialClassDaily: Partial<ClassProps>
		) => Promise<void>;
	}

	interface ComboboxData {
		label: string;
		value: string;
		picture: string; // shown next to the label in the list (the input shows only the label)
	}

	// Skeleton 5 types each part's `element` attributes for its default tag (div, ul, li);
	// the v3 markup rendered span, nav and button there instead.
	type AnyTagAttributes = HTMLAttributes<any>;

	// Skeleton 5's .btn squeezes direct child icons to --btn-size; icons get their v3 24px size
	// back with w-6 / size-6. (The v3 .btn padding/line-height is restored app-wide in app.css.)

	let {
		hasGuests = $bindable(undefined),
		guestDailies = $bindable([]),
		welcomeGuests = $bindable(false),
		guestAvatarMap = $bindable(new Map<string, IconRecord>()),
		guestPeople = [],
		peopleById = new Map<string, Person>(),
		pageLeft = () => {},
		pageRight = () => {},
		updateClassDailySlide = async (column: string, partialClassDaily: Partial<ClassProps>) => {}
	}: GuestCheckProps = $props();

	const updateHasGuests = (answer?: boolean) => {
		hasGuests = hasGuests === answer ? undefined : answer;
		updateClassDailySlide('attendance', { hasGuests: hasGuests });
	};
	const updateWelcomeGuests = () => {
		welcomeGuests = !welcomeGuests;
		updateClassDailySlide('attendance', { welcomeGuests: welcomeGuests });
	};

	let previousGuests: GuestDaily[] = $state([]);
	// regular guests (people) checked in today: they can check in only once a day
	let checkedInToday = $derived(checkedInPeople(guestDailies));
	// the regular guests not checked in yet, then the earlier one-off guests (each name once)
	let guestComboboxArray: GuestNameOption[] = $derived(
		guestNameOptions(guestPeople, previousGuests, peopleById, guestAvatarMap, checkedInToday)
	);
	// the icons for guests, by name; follows the Icons page live
	let avatarComboboxArray: ComboboxData[] = $derived(guestIconOptions(guestAvatarMap));
	const isOffered = (iconId: string | undefined) =>
		!!iconId && avatarComboboxArray.some((option) => option.value === iconId);

	// Skeleton 3's Combobox filtered its own list: typing kept the items whose label contains the
	// text (case-insensitive) and every open/close showed the whole list again. Skeleton 5 leaves
	// filtering to the app, so do the same here. Input changes while the list is closed (the first
	// keystroke, or the input syncing to a picked item) never showed a filtered list in v3, so they
	// are ignored; that also keeps every item in the collection for zag's value -> label lookups.
	const byLabel = (items: ComboboxData[], text: string) =>
		items.filter((item) => item.label.toLowerCase().includes(text.toLowerCase()));
	let guestFilter = $state('');
	let avatarFilter = $state('');
	let guestListOpen = false;
	let avatarListOpen = false;
	const guestOptions = $derived(byLabel(guestComboboxArray, guestFilter));
	const avatarOptions = $derived(byLabel(avatarComboboxArray, avatarFilter));
	const guestCollection = $derived(
		useListCollection({
			items: guestOptions,
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value
		})
	);
	const avatarCollection = $derived(
		useListCollection({
			items: avatarOptions,
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value
		})
	);

	onMount(async () => {
		const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
		const [year, month, day] = [
			yesterday.getFullYear(),
			yesterday.getMonth() + 1,
			yesterday.getDate()
		];
		const afterDate = month < 8 ? `${year - 1}-08-01` : `${year}-08-01`;
		const beforeDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

		previousGuests = await getGuestDailiesRange({ after: afterDate, before: beforeDate });
	});

	let selectedGuestName: string[] = $state([]);
	let modalGuestName: string = $state('');
	let selectedAvatarId: string[] = $state([]);
	let selectedPronoun: 'he' | 'she' | undefined = $state(undefined);
	// the regular guest picked from the list; undefined for a one-off guest
	let selectedPerson = $state<Person | undefined>(undefined);
	// ...as they are now (the People page may change them while the dialog is open)
	let currentPerson = $derived(
		selectedPerson && (peopleById.get(selectedPerson.id) ?? selectedPerson)
	);
	// a regular guest with their own picture needs no icon
	let usesOwnPicture = $derived(!!currentPerson?.avatar);
	// the name the preview shows and the check-in gets
	let previewName = $derived(currentPerson ? displayName(currentPerson) : modalGuestName);
	let modalOpen = $state(false);
	const resetModal = (closeModal: boolean = true) => {
		selectedGuestName = [];
		selectedAvatarId = [];
		selectedPronoun = undefined;
		selectedPerson = undefined;
		modalGuestName = '';
		if (closeModal) modalOpen = false;
	};

	const reusePreviousGuest = (e: any) => {
		console.log('Selected Guest', e);
		selectedPerson = guestComboboxArray.find((option) => option.value === e.value[0])?.person;
		// the combobox's value is the option's value (its id); zag shows that option's label
		selectedGuestName = e.value[0] ? [e.value[0]] : [];
		if (selectedPerson) {
			selectedPronoun = selectedPerson.pronoun || undefined;
			selectedAvatarId = [];
			return;
		}
		let guest = previousGuests.find((guest) => guest.id === e.value[0]);
		console.log('Guest', guest);
		selectedPronoun = guest?.pronoun || undefined;
		// their icon from last time, if it is still offered (it may be gone from the Icons page)
		selectedAvatarId = isOffered(guest?.avatar) ? [guest!.avatar] : [];
	};

	const updateModalGuestName = (guest: any) => {
		modalGuestName = guest.inputValue;
		// typing a different name makes it a one-off guest again (the list shows the display name)
		if (selectedPerson && modalGuestName !== displayName(selectedPerson))
			selectedPerson = undefined;
	};

	const updateAvatar = (avatar: any) => {
		selectedAvatarId = avatar.value;
		console.log('Avatars', avatar.value);
	};

	// the Delete Guest list shows each guest's picture small: the same one as their button
	const guestSmallPicture = (guest: GuestDaily) =>
		guestPictureUrl(
			guestPerson(guest, peopleById),
			guestAvatarMap.get(guest.avatar),
			SMALL_PICTURE
		);

	const avatarURL = (avatarId: string) => {
		// like on the guest page, a regular guest's own picture comes before the icon
		if (usesOwnPicture) return guestPictureUrl(currentPerson, null);
		let avatar = guestAvatarMap.get(avatarId);
		if (!avatar) return '/defaults/avatar.png';
		let url = getPbImageUrl(avatar.collectionId, avatar.id, avatar.image);
		console.log('Avatar URL', url);
		return url;
	};

	let adding = false; // a double click on Confirm saves the guest once
	const addGuest = async (closeModal: boolean = true) => {
		if (!modalGuestName || (!selectedAvatarId[0] && !usesOwnPicture)) {
			return alert('Please select a name and an avatar!');
		}
		if (selectedAvatarId[0] && !isOffered(selectedAvatarId[0])) {
			// removed (or no longer for guests) on the Icons page while the dialog was open
			selectedAvatarId = [];
			if (!usesOwnPicture) return alert('That icon was just removed. Please pick another one.');
		}
		if (adding) return;

		const name = previewName;
		if (selectedPerson) {
			// deleted, switched off, no longer a guest or already checked in since they were picked
			const problem = regularGuestProblem(
				selectedPerson,
				peopleById.get(selectedPerson.id),
				checkedInToday
			);
			if (problem) return alert(problem);
		}
		adding = true;
		try {
			if (selectedPerson) {
				await createGuestDaily({
					name,
					pronoun: selectedPronoun,
					person: selectedPerson.id,
					avatar: selectedAvatarId[0] ?? ''
				});
			} else {
				await createGuestDaily({
					name,
					pronoun: selectedPronoun,
					avatar: selectedAvatarId[0]
				});
			}
		} catch (error) {
			// keep the dialog open so the teacher can change the guest or cancel
			console.error(error);
			return alert(guestCheckInError(name, error));
		} finally {
			adding = false;
		}
		resetModal(closeModal);
	};

	// a regular guest's current name and title, else the name saved at check-in
	const guestName = (guest: GuestDaily) => guestDisplayName(guest, guestPerson(guest, peopleById));

	const welcomeString = () => {
		if (!guestDailies) return "Let's welcome our guests!";
		if (guestDailies.length === 1) return `Let's welcome ${guestName(guestDailies[0])}!`;
		if (guestDailies.length > 1) {
			let dailies = guestDailies.slice(0, -1);
			let lastGuest = guestDailies[guestDailies.length - 1];
			return `Let's welcome ${dailies.map(guestName).join(', ')} and ${guestName(lastGuest)}!`;
		}
	};

	let popoverOpen: boolean = $state(false);

	const isTextEntry = (target: EventTarget | null) =>
		target instanceof HTMLElement &&
		(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

	const onKeydown = (event: KeyboardEvent) => {
		// While the Add Guest dialog is open, or while typing in a field, the arrow keys belong to
		// the caret and the suggestion lists; flipping the page would unmount the dialog and lose
		// the guest being entered.
		if (modalOpen || isTextEntry(event.target)) return;
		if (event.key === 'ArrowLeft') {
			pageLeft();
		} else if (event.key === 'ArrowRight') {
			pageRight();
		}
	};

	const welcomeVideo = { id: 'batjBLqr8ck', start: 201, end: 223 };
	const youtubeEmbeddedUrl = youtubeEmbedUrl(welcomeVideo);
	// (spelled out: the linter only recognises a literal https: link as external)
	const youtubeUrl = `https://www.youtube.com/watch?v=${welcomeVideo.id}&t=${welcomeVideo.start}s`;

	const removeGuest = async (guest: GuestDaily) => {
		try {
			await deleteGuestDaily(guest);
		} catch (error) {
			reportSaveError(error, `Removing ${guestName(guest)}`, false, 'guests');
		}
	};
</script>

<!--
	Combobox parts shared by the Guest Name and Avatar boxes, rendered with the same elements and
	classes as Skeleton 3's <Combobox>. Skeleton 5 styles every [data-scope=combobox] part with its
	own look, so these parts drop data-scope (zag finds them by id and role) and use the v3 input
	group styles from the <style> block below.
-->
{#snippet comboboxParts(options: ComboboxData[], contentClasses: string, itemLabelClass: string)}
	<Combobox.Label class="label" data-scope={null}>
		<Combobox.Control>
			{#snippet element(attributes)}
				<div {...attributes} data-scope={null} class="input-group grid-cols-[1fr_auto]">
					<Combobox.Input>
						{#snippet element(attributes)}
							<input {...attributes} data-scope={null} class="ig-input" />
						{/snippet}
					</Combobox.Input>
					<Combobox.Trigger>
						{#snippet element(attributes)}
							<button {...attributes} data-scope={null} class="ig-btn hover:bg-surface-950/5">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									style="opacity: 0.5"
								>
									<path d="m6 9 6 6 6-6" />
								</svg>
							</button>
						{/snippet}
					</Combobox.Trigger>
				</div>
			{/snippet}
		</Combobox.Control>
	</Combobox.Label>
	<Combobox.Context>
		{#snippet children(combobox)}
			{#if combobox().open}
				<Combobox.Positioner>
					{#snippet element(attributes)}
						<div {...attributes} data-scope={null} transition:fade|global={{ duration: 100 }}>
							{#if options.length > 0}
								<Combobox.Content>
									{#snippet element(attributes: AnyTagAttributes)}
										<nav
											{...attributes}
											data-scope={null}
											class="card p-2 preset-outlined-surface-200-800 bg-surface-50-950 space-y-1 {contentClasses}"
										>
											{#each options as option (option.value)}
												<Combobox.Item item={option}>
													{#snippet element(attributes: AnyTagAttributes)}
														{@const checked = attributes['data-state'] === 'checked'}
														<button
															{...attributes}
															data-scope={null}
															type="button"
															class="btn justify-start w-full {checked
																? 'preset-filled-primary-500'
																: 'hover:bg-surface-950/5'}"
														>
															<div class="flex w-full items-center justify-between space-x-2">
																<!-- a name cut short (…) shows in full on hover -->
																<span class={itemLabelClass} title={option.label}>
																	{option.label}
																</span>
																<NamePicture src={option.picture} />
															</div>
														</button>
													{/snippet}
												</Combobox.Item>
											{/each}
										</nav>
									{/snippet}
								</Combobox.Content>
							{/if}
						</div>
					{/snippet}
				</Combobox.Positioner>
			{/if}
		{/snippet}
	</Combobox.Context>
{/snippet}

<svelte:window onkeydown={onKeydown} onblur={releaseVideoFocus} />

{#if hasGuests != undefined}
	<div class="h-1/12 absolute bottom-2 left-2 flex w-4/12 justify-start gap-[2%]">
		<button
			class="btn preset-tonal-secondary aspect-square h-full rounded-full border p-0"
			onclick={() => (welcomeGuests ? updateWelcomeGuests() : updateHasGuests(undefined))}
		>
			<Undo class="h-full w-6" />
		</button>
		{#if hasGuests}
			<button
				class="btn preset-tonal-primary aspect-square h-full rounded-full border p-0"
				onclick={() => (modalOpen = true)}
			>
				<UserRoundPlus class="h-full w-6" />
			</button>
			<Popover
				open={popoverOpen}
				onOpenChange={(e) => (popoverOpen = e.open)}
				positioning={{ placement: 'right-end' }}
			>
				<span data-testid="popover">
					<Popover.Trigger
						class="btn preset-tonal-error aspect-square h-full rounded-full border p-0"
					>
						<Trash class="h-full w-6" />
					</Popover.Trigger>
				</span>
				<StagePortal>
					<Popover.Positioner>
						<!-- like v3, the content only exists (with a short fade) while zag has it open -->
						<Popover.Context>
							{#snippet children(popover)}
								{#if popover().open}
									<Popover.Content>
										{#snippet element(attributes)}
											<div {...attributes} transition:fade|global={{ duration: 100 }}>
												<Popover.Arrow class="[--arrow-size:10px]">
													<Popover.ArrowTip class="!bg-error-200 dark:!bg-error-800" />
												</Popover.Arrow>
												<div class="card bg-error-200-800 p-4 space-y-4">
													<header class="center flex">
														<p class="text-size-1 text-center font-semibold">Delete Guest</p>
													</header>
													<article class="flex h-full flex-col items-center gap-2 overflow-y-auto">
														{#each guestDailies as guest (guest.id)}
															<button
																type="button"
																class="btn preset-tonal-error-500 w-full rounded-full text-left"
																onclick={() => removeGuest(guest)}
															>
																<div
																	class="text-size-1 flex w-full items-center justify-between space-x-2"
																>
																	<span class="truncate">{guestName(guest)}</span>
																	<NamePicture src={guestSmallPicture(guest)} />
																</div>
															</button>
														{/each}
													</article>
												</div>
											</div>
										{/snippet}
									</Popover.Content>
								{/if}
							{/snippet}
						</Popover.Context>
					</Popover.Positioner>
				</StagePortal>
			</Popover>
			<button
				onclick={updateWelcomeGuests}
				class="btn preset-tonal-success aspect-square h-full rounded-full border p-0"
			>
				<TvMinimalPlay class="h-full w-6" />
			</button>
		{/if}
		{#if welcomeGuests}
			<a
				href={youtubeUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="btn aspect-square h-full overflow-clip rounded-full border p-0"
			>
				<img class="h-full" src="/youtube.png" alt="" />
			</a>
		{/if}
	</div>
{/if}

{#if welcomeGuests}
	<div class="flex h-[90%] w-full flex-col items-center justify-around">
		<h1 class="text-size-7 text-pretty text-center font-bold">{welcomeString()}</h1>
		<div class="h-8/12 flex min-h-0 w-full justify-center">
			<!--iFrame of youtube video with 16/9 ratio-->
			<iframe
				class="rounded-4xl aspect-video h-full"
				src={youtubeEmbeddedUrl}
				title="YouTube video player"
				frameborder="0"
				allowfullscreen
			></iframe>
		</div>
	</div>
{:else if hasGuests === undefined}
	<div class="flex h-full w-full flex-col items-center justify-center">
		<h1 class="text-size-9 my-[2%] text-center font-black">Any Guests Today?</h1>
		<h2 class="text-size-4 my-[5%]">Look around the room and check!</h2>
	</div>
	<div class=" absolute bottom-2 flex h-1/6 w-full justify-around gap-4">
		<button
			class="btn text-size-6 preset-filled-success-500 aspect-square w-1/5 rounded-full border-2 p-[2%]"
			onclick={() => updateHasGuests(true)}>Yes</button
		>
		<button
			class="btn text-size-6 preset-filled-error-500 aspect-square w-1/5 rounded-full border-2 p-[2%]"
			onclick={() => updateHasGuests(false)}>No</button
		>
	</div>
{:else if !hasGuests}
	<div class="flex h-full w-full flex-col items-center justify-center">
		<h1 class="text-size-9 my-[2%] text-center font-black">No Guests Today!</h1>
		<h2 class="text-size-4 my-[5%]">There are no guests today.</h2>
	</div>
{:else if hasGuests}
	<div class="flex h-full w-full flex-col items-center justify-start">
		<h1 class="text-size-9 text-center font-black">Who are they?</h1>
		{#if guestDailies.length > 0}
			<div
				class="flex h-[80%] w-full flex-row flex-wrap items-center justify-center gap-[10%] overflow-y-auto pt-[1%] shadow"
			>
				{#each guestDailies as guest (guest.id)}
					<GuestButton
						{guest}
						person={guestPerson(guest, peopleById)}
						{guestAvatarMap}
						buttonClass="px-[2%] h-2/5"
						nameClass="text-size-7"
						onClick={() => {}}
					/>
				{/each}
			</div>
		{:else}
			<div class="flex h-[70%] w-full items-center justify-center gap-[10%]">
				<button
					class="btn preset-filled-primary-500 text-size-6 flex justify-center rounded-full p-[2%]"
					onclick={() => (modalOpen = true)}
				>
					<UserRoundPlus class="size-6" />
					<span class="">Add a Guest</span>
				</button>
			</div>
		{/if}
	</div>
{/if}

<Dialog open={modalOpen} onOpenChange={(e) => (modalOpen = e.open)}>
	<Portal>
		<!--
			Like v3's <Modal>, everything below only exists while zag has the dialog open (so the
			comboboxes start fresh each time) and fades/flies in and out the same way.
		-->
		<Dialog.Context>
			{#snippet children(dialog)}
				{#if dialog().open}
					<Dialog.Backdrop
						class="fixed top-0 left-0 right-0 bottom-0 z-[998] bg-surface-50/75 dark:bg-surface-950/75 backdrop-blur-sm"
					>
						{#snippet element(attributes)}
							<div {...attributes} transition:fade|global={{ duration: 100 }}></div>
						{/snippet}
					</Dialog.Backdrop>
					<Dialog.Positioner
						class="fixed top-0 left-0 right-0 bottom-0 z-[999] flex justify-center items-center p-4"
					>
						{#snippet element(attributes)}
							<div {...attributes} transition:fly|global={{ y: 50, duration: 200 }}>
								<Dialog.Content
									class="card  preset-filled-primary-50-950 p-4 space-y-4 shadow-xl w-full max-w-screen-sm"
								>
									<header class="flex justify-between">
										<Combobox
											ids={{ root: 'guest-combobox' }}
											class="shadow w-[45%] z-10"
											allowCustomValue={true}
											collection={guestCollection}
											value={selectedGuestName}
											onValueChange={reusePreviousGuest}
											onInputValueChange={(e) => {
												if (guestListOpen) guestFilter = e.inputValue;
												updateModalGuestName(e);
											}}
											onOpenChange={(e) => {
												guestListOpen = e.open;
												guestFilter = '';
											}}
											placeholder="Guest Name"
										>
											{#snippet element(attributes: AnyTagAttributes)}
												<span {...attributes} data-scope={null} data-testid="combobox">
													<!-- a long name wraps at its spaces (a word too long for the list is cut with …), so its picture stays inside -->
													{@render comboboxParts(
														guestOptions,
														'',
														'min-w-0 overflow-hidden text-ellipsis whitespace-normal text-left leading-tight'
													)}
												</span>
											{/snippet}
										</Combobox>

										<!-- bg-surface-950/5 is v3's preset-tonal (v5's is darker and recolours the text) -->
										<nav
											class="btn preset-outlined-surface-500 group relative w-[15%] gap-0 overflow-clip rounded-full outline-2 contain-strict"
										>
											<button
												type="button"
												onclick={() =>
													(selectedPronoun = selectedPronoun === 'he' ? undefined : 'he')}
												class={`btn  -ml-[50%] w-1/2 border-r-2 py-[50%] pl-[50%] ${selectedPronoun == 'he' ? 'bg-blue-400 hover:bg-blue-600' : 'bg-surface-950/5 hover:bg-blue-500'}`}
												>He</button
											>
											<button
												type="button"
												onclick={() =>
													(selectedPronoun = selectedPronoun === 'she' ? undefined : 'she')}
												class={`btn -mr-[50%] w-1/2 border-l-2 py-[50%] pr-[50%] ${selectedPronoun == 'she' ? 'bg-pink-400 hover:bg-pink-600' : 'bg-surface-950/5 hover:bg-pink-500'}`}
												>She</button
											>
										</nav>
										<Combobox
											ids={{ root: 'avatar-combobox' }}
											class="shadow z-10 w-1/3 w-[35%] h-2/5"
											allowCustomValue={false}
											collection={avatarCollection}
											value={selectedAvatarId}
											onValueChange={updateAvatar}
											onInputValueChange={(e) => {
												if (avatarListOpen) avatarFilter = e.inputValue;
											}}
											onOpenChange={(e) => {
												avatarListOpen = e.open;
												avatarFilter = '';
											}}
											onFocusOutside={(e) => console.log('focus outside', e)}
											placeholder={usesOwnPicture ? 'Uses their picture' : 'Avatar'}
										>
											{#snippet element(attributes: AnyTagAttributes)}
												<span {...attributes} data-scope={null} data-testid="combobox">
													{@render comboboxParts(
														avatarOptions,
														'max-h-64 overflow-auto',
														'w-5/6 truncate'
													)}
												</span>
											{/snippet}
										</Combobox>
									</header>
									<article class="flex h-24 w-full items-center justify-center gap-[10%]">
										<SampleButton
											buttonClass="h-full"
											imageUrl={avatarURL(selectedAvatarId[0])}
											text={previewName}
											imgAlt={previewName}
											textClass="text-size-7 fontbold"
										/>
									</article>
									<footer class="flex justify-end gap-4">
										<button
											type="button"
											class="btn bg-surface-950/5"
											onclick={() => resetModal()}>Cancel</button
										>
										<button
											type="button"
											class="btn preset-filled"
											onclick={() => addGuest()}>Confirm</button
										>
									</footer>
								</Dialog.Content>
							</div>
						{/snippet}
					</Dialog.Positioner>
				{/if}
			{/snippet}
		</Dialog.Context>
	</Portal>
</Dialog>

<style>
	/* Skeleton 3's input-group, ig-input and ig-btn utilities (gone in Skeleton 5), which gave
	   the Guest Name and Avatar boxes their look. */
	.input-group {
		border-radius: var(--radius-base);
		display: grid;
		align-items: stretch;
		overflow: hidden;
		outline-color: transparent;
		border-width: 0;
		--tw-ring-inset: inset;
		--tw-ring-color: var(--color-surface-200-800);
		--tw-ring-shadow: var(--tw-ring-inset,) 0 0 0 var(--default-ring-width)
			var(--tw-ring-color, currentColor);
		box-shadow:
			var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow),
			var(--tw-ring-shadow), var(--tw-shadow);
	}
	.input-group > * + * {
		border-left-width: 1px !important;
		border-color: var(--color-surface-200-800);
	}
	.ig-input {
		background-color: transparent;
		display: block;
		width: 100%;
		font-size: var(--text-base);
		line-height: var(--text-base--line-height);
		padding-block: calc(var(--spacing) * 1);
		padding-inline: calc(var(--spacing) * 3);
		outline-color: transparent;
		border-width: 0;
		--tw-ring-inset: inset;
	}
	.ig-input:active,
	.ig-input:focus,
	.ig-input:focus-within {
		--tw-ring-color: var(--color-primary-500);
	}
	.ig-btn {
		display: inline-flex;
		flex-direction: row;
		align-items: center;
		justify-content: center;
		gap: calc(var(--spacing) * 2);
		text-decoration-line: none;
		white-space: nowrap;
		font-size: var(--text-base);
		line-height: var(--text-base--line-height);
		padding-block: calc(var(--spacing) * 1);
		padding-inline: calc(var(--spacing) * 4);
		transition-property: all;
		transition-timing-function: var(--default-transition-timing-function);
		transition-duration: var(--default-transition-duration);
	}
	@media (hover: hover) {
		.ig-btn:hover {
			filter: brightness(125%);
		}
	}
	/* v3 Combobox: keyboard-highlighted option */
	[data-part='item'][data-highlighted]:not([data-state='checked']) {
		background-color: var(--color-surface-200-800);
	}
</style>
