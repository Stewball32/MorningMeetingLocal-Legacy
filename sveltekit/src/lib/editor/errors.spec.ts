import { describe, expect, it } from 'vitest';
import { ClientResponseError } from 'pocketbase';
import { describeError, validationCodes } from './errors.ts';

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
		const fieldOf = { name: 'name', video_end: 'end', avatar: 'avatar' } as const;
		const problem = describeError(error, 'add the person', { fieldOf });
		expect(problem.offline).toBe(false);
		expect(problem.fields).toEqual({
			name: 'Missing required value.',
			end: 'Must be larger than 0.',
			avatar: 'File too big.'
		});
		expect(problem.message).toBe("Couldn't add the person. Please fix the highlighted fields.");
	});

	it('says plainly that a file is not a usable picture', () => {
		// What PocketBase 0.26 answers for a file that is named .png but isn't a picture.
		const error = new ClientResponseError({
			status: 400,
			response: {
				status: 400,
				message: 'Failed to create record.',
				data: {
					image: {
						code: 'validation_invalid_mime_type',
						message:
							'"fake_ptdw7qf8s2.png" mime type must be one of: image/jpeg, image/png, image/svg+xml, image/gif, image/webp.',
						params: { file: 'fake_ptdw7qf8s2.png' }
					}
				}
			}
		});
		const plain =
			"That file isn't a picture that can be used here (JPEG, PNG, GIF, WebP or SVG). Please choose another.";
		// Under the picture in the form, which asks to fix the highlighted field.
		const problem = describeError(error, 'add Fake', { fieldOf: { image: 'image' } });
		expect(problem.fields).toEqual({ image: plain });
		expect(problem.message).toBe("Couldn't add Fake. Please fix the highlighted fields.");
		// Without the form's map, in the message itself.
		expect(describeError(error, 'add Fake').message).toBe(
			`Couldn't add Fake: Failed to create record. (image: ${plain})`
		);
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

	it('explains a record that is gone, naming it', () => {
		const error = new ClientResponseError({
			status: 404,
			response: { message: "The requested resource wasn't found." }
		});
		const problem = describeError(error, 'delete Finn', { noun: 'person', pronoun: 'They' });
		expect(problem.notFound).toBe(true);
		expect(problem.message).toBe(
			"Couldn't delete Finn: this person no longer exists. They may have been deleted in another window."
		);
		expect(describeError(error, 'save Sun', { noun: 'icon' }).message).toBe(
			"Couldn't save Sun: this icon no longer exists. It may have been deleted in another window."
		);
		expect(describeError(error, 'save it').message).toMatch(/this record no longer exists\. It /);
	});

	it('leaves fields the map does not name in the message', () => {
		const error = new ClientResponseError({
			status: 400,
			response: {
				message: 'Failed to create record.',
				data: {
					name: { code: 'validation_required', message: 'Missing required value.' },
					secret: { code: 'x', message: 'Bad.' }
				}
			}
		});
		const problem = describeError(error, 'add it', { fieldOf: { name: 'title' } });
		expect(problem.fields).toEqual({ title: 'Missing required value.' });
		expect(problem.message).toBe(
			"Couldn't add it. Please fix the highlighted fields. (secret: Bad.)"
		);
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

describe('validationCodes', () => {
	it("lists PocketBase's error codes by field", () => {
		const error = new ClientResponseError({
			status: 400,
			response: {
				message: 'Failed to create record.',
				data: {
					name: { code: 'validation_not_unique', message: 'Value must be unique.' },
					image: { code: 'validation_invalid_mime_type', message: 'Invalid file type.' }
				}
			}
		});
		expect(validationCodes(error)).toEqual({
			name: 'validation_not_unique',
			image: 'validation_invalid_mime_type'
		});
	});

	it('is empty for other errors', () => {
		expect(validationCodes(new Error('boom'))).toEqual({});
		expect(validationCodes(new ClientResponseError({ status: 0 }))).toEqual({});
		expect(validationCodes(undefined)).toEqual({});
	});
});
