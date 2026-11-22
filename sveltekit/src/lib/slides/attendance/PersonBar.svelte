<script lang="ts">
	import type { Person, PersonDaily } from '#lib/pb/types.ts';
	import PersonButton from '#lib/buttons/PersonButton.svelte';

	interface PersonBarProps {
		people: Person[];
		dailyMap: Map<string, PersonDaily>;
		currentPerson: Person | undefined;
		onClick: (person: Person) => void;
	}

	let { people, dailyMap, currentPerson, onClick }: PersonBarProps = $props();

	const getButtonPreset = (person: Person) => {
		const daily = dailyMap.get(person.id);
		if (!daily) return 'surface';
		if (daily.here === 'present') return 'success';
		if (daily.here === 'absent') return 'error';
		return 'surface';
	};
</script>

<div class="h-2/12 mx-auto flex w-full justify-evenly p-1 contain-strict">
	{#each people as person (person.id)}
		{#if person.id !== currentPerson?.id}
			<PersonButton
				{person}
				buttonPreset={getButtonPreset(person)}
				buttonClass="aspect-square p-0"
				showName={false}
				onClick={() => onClick(person)}
			/>
		{/if}
	{/each}
</div>
