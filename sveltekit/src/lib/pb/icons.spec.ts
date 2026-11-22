import { describe, expect, it, vi } from 'vitest';

// A fake of the SDK, as far as the icon requests use it: getList answers how many records match.
const requests: { collection: string; options: Record<string, unknown> }[] = [];
const matches: Record<string, number> = {};
vi.mock('#lib/pb/index.ts', () => ({
	pb: {
		filter: (expression: string, params: Record<string, string>) =>
			expression.replace(/\{:(\w+)\}/g, (_, key) => JSON.stringify(params[key])),
		collection: (collection: string) => ({
			getList: async (_page: number, _perPage: number, options: Record<string, unknown>) => {
				requests.push({ collection, options });
				return { totalItems: matches[`${collection} ${options.filter}`] ?? 0, items: [] };
			}
		})
	},
	getPbImageUrl: (collectionId: string, recordId: string, file: string) =>
		`http://pb/api/files/${collectionId}/${recordId}/${file}`
}));

const { countIconUses, iconPictureUrl } = await import('./icons.ts');

describe('countIconUses', () => {
	it('counts the guest check-ins and observances that point at the icon', async () => {
		matches['guest_dailies avatar = "mh7f9dlc7939t2o"'] = 12;
		matches['calendar_observances icon = "mh7f9dlc7939t2o"'] = 1;
		expect(await countIconUses('mh7f9dlc7939t2o')).toEqual({ guests: 12, calendar: 1 });
		// One tiny request each, never cancelled by the other (requestKey: null), and given up on
		// if PocketBase doesn't answer (signal).
		const signal = expect.any(AbortSignal);
		expect(requests.map((request) => request.options)).toEqual([
			{ filter: 'avatar = "mh7f9dlc7939t2o"', fields: 'id', requestKey: null, signal },
			{ filter: 'icon = "mh7f9dlc7939t2o"', fields: 'id', requestKey: null, signal }
		]);
		expect(await countIconUses('somethingelse12')).toEqual({ guests: 0, calendar: 0 });
	});
});

describe('iconPictureUrl', () => {
	const icon = { collectionId: 'pbc_423132189', id: 'mh7f9dlc7939t2o', image: 'rocket.png' };

	it('points at the picture, or a small copy of it', () => {
		expect(iconPictureUrl(icon)).toBe(
			'http://pb/api/files/pbc_423132189/mh7f9dlc7939t2o/rocket.png'
		);
		expect(iconPictureUrl(icon, '100x100')).toBe(
			'http://pb/api/files/pbc_423132189/mh7f9dlc7939t2o/rocket.png?thumb=100x100'
		);
	});

	it("is '' without a picture (never a URL that can't load)", () => {
		expect(iconPictureUrl({ ...icon, image: '' }, '100x100')).toBe('');
	});
});
