import { afterEach, describe, expect, it, vi } from 'vitest';

// A fake of the SDK, as far as countRecords uses it: getList answers when told to, and gives up
// (like fetch) when its signal is aborted.
let answer: ((total: number) => void) | undefined;
vi.mock('#lib/pb/index.ts', () => ({
	pb: {
		collection: () => ({
			getList: (_page: number, _perPage: number, options: { signal?: AbortSignal }) =>
				new Promise((resolve, reject) => {
					answer = (totalItems) => resolve({ totalItems, items: [] });
					options.signal?.addEventListener('abort', () => reject(options.signal?.reason));
				})
		})
	},
	getPbImageUrl: () => ''
}));

const { COUNT_TIMEOUT_MS, countRecords } = await import('./requests.ts');

afterEach(() => {
	vi.restoreAllMocks();
	answer = undefined;
});

describe('countRecords', () => {
	it('answers how many records match', async () => {
		const counting = countRecords('guest_dailies', 'avatar = "x"');
		answer?.(12);
		expect(await counting).toBe(12);
	});

	it("gives up when PocketBase doesn't answer within about 10 s", async () => {
		// The delete dialogs then say the count failed instead of waiting at "Counting…".
		const timeout = new AbortController();
		const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
		const counting = countRecords('guest_dailies', 'avatar = "x"');
		expect(timeoutSpy).toHaveBeenCalledWith(COUNT_TIMEOUT_MS);
		expect(COUNT_TIMEOUT_MS).toBe(10_000);
		timeout.abort(new DOMException('The operation timed out.', 'TimeoutError'));
		await expect(counting).rejects.toThrow('timed out');
	});
});
