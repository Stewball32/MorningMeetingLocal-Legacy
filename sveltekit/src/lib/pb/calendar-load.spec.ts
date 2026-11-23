import { afterEach, describe, expect, it, vi } from 'vitest';

// getHolidayMap() on top of a fake PocketBase: each collection's getFullList answers what a test
// puts in `answers` (or throws it, for an Error).
const answers: Record<string, unknown> = {};
const requests: { collection: string; options: Record<string, unknown> }[] = [];
vi.mock('#lib/pb/index.ts', () => ({
	pb: {
		collection: (collection: string) => ({
			getFullList: async (options: Record<string, unknown>) => {
				requests.push({ collection, options });
				const answer = answers[collection];
				if (answer instanceof Error) throw answer;
				return answer ?? [];
			}
		})
	},
	getPbImageUrl: (collectionId: string, id: string, file: string) =>
		`pb/${collectionId}/${id}/${file}`
}));

const { getHolidayMap } = await import('./calendar.ts');

const bluey = {
	id: 'per000000000001',
	collectionId: 'pbc_1795321340',
	name: 'Bluey',
	title: '',
	avatar: 'bluey.png',
	active: true,
	birthday: '11-30'
};

afterEach(() => {
	for (const key of Object.keys(answers)) delete answers[key];
	requests.length = 0;
	vi.restoreAllMocks();
});

describe('getHolidayMap', () => {
	it('adds the birthdays of the active people, asking only for the fields it needs', async () => {
		answers.people = [bluey];
		const map = await getHolidayMap(2026, 10);
		expect(map.get(30)?.map((h) => [h.name, h.image])).toEqual([
			["Bluey's Birthday", 'pb/pbc_1795321340/per000000000001/bluey.png']
		]);
		expect(map.get(26)?.[0].name).toBe('Thanksgiving Day');
		const people = requests.find((r) => r.collection === 'people')?.options;
		expect(people).toMatchObject({ filter: "active = true && birthday != ''" });
		expect(String(people?.fields).split(',').sort()).toEqual(
			[
				'active',
				'avatar',
				'birthday',
				'collectionId',
				'collectionName',
				'id',
				'name',
				'title'
			].sort()
		);
	});

	it('still shows the observances when the birthdays fail, and says why in the console', async () => {
		answers.people = new Error('Something went wrong while processing your request.');
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const map = await getHolidayMap(2026, 10);
		expect(map.get(26)?.map((h) => h.name)).toEqual(['Thanksgiving Day']);
		expect(map.get(30)).toBeUndefined();
		expect(error).toHaveBeenCalledWith('Could not load the birthdays', answers.people);
	});

	it('fails when the observances fail (the slide keeps what it shows)', async () => {
		answers.calendar_observances = new Error('Failed to fetch');
		answers.people = [bluey];
		await expect(getHolidayMap(2026, 10)).rejects.toThrow('Failed to fetch');
	});
});
