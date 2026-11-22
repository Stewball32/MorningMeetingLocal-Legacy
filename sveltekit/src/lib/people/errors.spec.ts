import { describe, expect, it } from 'vitest';
import { ClientResponseError } from 'pocketbase';
import { describeError } from './errors.ts';

describe('describeError', () => {
	it('spots an unreachable PocketBase', () => {
		const error = new ClientResponseError({ status: 0, originalError: new TypeError('fetch') });
		const problem = describeError(error, 'save Bluey');
		expect(problem.offline).toBe(true);
		expect(problem.message).toMatch(/^Couldn't save Bluey\. Can't reach PocketBase/);
		expect(problem.fields).toEqual({});
	});

	it('puts validation errors next to the matching form fields', () => {
		const error = new ClientResponseError({
			status: 400,
			response: {
				status: 400,
				message: 'Failed to create record.',
				data: {
					name: { code: 'validation_required', message: 'Missing required value.' },
					video_end: {
						code: 'validation_min_number_constraint',
						message: 'Must be larger than 0.'
					},
					avatar: { code: 'validation_file_size_limit', message: 'File too big.' }
				}
			}
		});
		const problem = describeError(error, 'add the person', { form: true });
		expect(problem.offline).toBe(false);
		expect(problem.fields).toEqual({
			name: 'Missing required value.',
			end: 'Must be larger than 0.',
			avatar: 'File too big.'
		});
		expect(problem.message).toBe("Couldn't add the person. Please fix the highlighted fields.");
	});

	it('only speaks of highlighted fields for the form', () => {
		// What PocketBase answered when deleting a regular guest clashed with the guest_dailies
		// unique index (before guest check-ins were deleted with the person).
		const error = new ClientResponseError({
			status: 400,
			response: {
				message: 'Failed to delete record.',
				data: Object.fromEntries(
					['avatar', 'date', 'name', 'person'].map((key) => [
						key,
						{ code: 'validation_not_unique', message: 'Value must be unique.' }
					])
				)
			}
		});
		const problem = describeError(error, 'delete Ms. Gwen');
		expect(problem.fields).toEqual({});
		expect(problem.message).toBe(
			"Couldn't delete Ms. Gwen: Failed to delete record. (avatar: Value must be unique.; date: Value must be unique.; name: Value must be unique.; person: Value must be unique.)"
		);
		expect(problem.message).not.toMatch(/highlighted/);
	});

	it('mentions errors for fields the form does not have', () => {
		const error = new ClientResponseError({
			status: 400,
			response: { message: 'Failed.', data: { mystery: { code: 'x', message: 'Bad.' } } }
		});
		const problem = describeError(error, 'save');
		expect(problem.fields).toEqual({});
		expect(problem.message).toBe("Couldn't save: Failed. (mystery: Bad.)");
	});

	it('explains a record that is gone', () => {
		const error = new ClientResponseError({
			status: 404,
			response: { message: "The requested resource wasn't found." }
		});
		const problem = describeError(error, 'delete Finn');
		expect(problem.notFound).toBe(true);
		expect(problem.message).toMatch(/no longer exists/);
	});

	it("passes PocketBase's message through otherwise", () => {
		const error = new ClientResponseError({ status: 403, response: { message: 'Not allowed.' } });
		expect(describeError(error, 'save').message).toBe("Couldn't save: Not allowed.");
	});

	it('handles errors that are not from PocketBase', () => {
		expect(describeError(new Error('boom'), 'save').message).toBe("Couldn't save: boom");
		expect(describeError('odd', 'save').message).toBe("Couldn't save: odd");
	});
});
