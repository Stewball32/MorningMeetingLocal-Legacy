import { describe, expect, it } from 'vitest';
import { ClientResponseError } from 'pocketbase';
import { describeSaveError, isUnreachable } from './saveError.ts';

describe('describeSaveError', () => {
	const offline = new ClientResponseError({ url: 'x', status: 0 });
	const refused = new ClientResponseError({ url: 'x', status: 400, data: {} });

	it('tells "PocketBase is unreachable" apart from a refused save', () => {
		expect(isUnreachable(offline)).toBe(true);
		expect(isUnreachable(new Error('wrapped', { cause: offline }))).toBe(true);
		expect(isUnreachable(new TypeError('Failed to fetch'))).toBe(true);
		expect(isUnreachable(refused)).toBe(false);
	});

	it('says what was not saved, in plain words', () => {
		expect(describeSaveError(offline, "Bluey's attendance")).toBe(
			"Bluey's attendance wasn't saved: can't reach PocketBase. Please try again in a moment."
		);
		expect(describeSaveError(offline, 'The slide', true)).toBe(
			"The slide wasn't saved: can't reach PocketBase. It will be saved as soon as PocketBase is back."
		);
		expect(describeSaveError(refused)).toBe(
			"That change wasn't saved: PocketBase refused it (error 400). Please try again in a moment."
		);
	});
});
