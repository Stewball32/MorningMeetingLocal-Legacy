import { describe, expect, it } from 'vitest';
import { ClientResponseError } from 'pocketbase';
import { changedFields } from '#lib/editor/form.ts';
import type { IconRecord } from '#lib/pb/types.ts';
import {
	emptyForm,
	FORM_FIELD_OF,
	fieldsFromForm,
	formFromIcon,
	isNameEmojiTaken,
	PICTURE_NEEDED,
	sameForm,
	takenMessage,
	validateForm
} from './form.ts';

const rocket = {
	id: 'mh7f9dlc7939t2o',
	collectionId: 'pbc_423132189',
	collectionName: 'icons',
	name: 'Rocket',
	emoji: '🚀',
	image: 'icon1.png',
	for_guests: true,
	for_calendar: false
} as IconRecord;

describe('form values', () => {
	it('starts empty with every switch off, or with a preset', () => {
		expect(emptyForm()).toEqual({ name: '', emoji: '', for_guests: false, for_calendar: false });
		expect(emptyForm({ for_calendar: true }).for_calendar).toBe(true);
	});

	it('reads an icon', () => {
		expect(formFromIcon(rocket)).toEqual({
			name: 'Rocket',
			emoji: '🚀',
			for_guests: true,
			for_calendar: false
		});
	});

	it('trims text when saving', () => {
		expect(
			fieldsFromForm({ ...formFromIcon(rocket), name: '  Big rocket ', emoji: ' 🚀 ' })
		).toEqual({ name: 'Big rocket', emoji: '🚀', for_guests: true, for_calendar: false });
	});

	it('sends nothing when only spaces changed', () => {
		const start = formFromIcon(rocket);
		const typed = { ...start, name: ' Rocket ' };
		expect(sameForm(typed, start)).toBe(true);
		expect(changedFields(fieldsFromForm(start), fieldsFromForm(typed))).toEqual({});
		expect(
			changedFields(fieldsFromForm(start), fieldsFromForm({ ...start, for_calendar: true }))
		).toEqual({ for_calendar: true });
	});

	it('maps every PocketBase field to a form field', () => {
		for (const field of ['name', 'emoji', 'image', 'for_guests', 'for_calendar'])
			expect(FORM_FIELD_OF[field]).toBe(field);
	});
});

describe('validateForm', () => {
	const valid = { name: 'Rocket', emoji: '🚀', for_guests: false, for_calendar: true };

	it('accepts a valid icon', () => {
		expect(validateForm(valid, { hasPicture: false })).toEqual({});
	});

	it('needs a name and one emoji', () => {
		expect(validateForm({ ...valid, name: '  ', emoji: '' }, { hasPicture: true })).toEqual({
			name: 'Please enter a name.',
			emoji: 'Please choose an emoji.'
		});
		expect(validateForm({ ...valid, emoji: '🚀🚀' }, { hasPicture: true }).emoji).toMatch(
			/just one emoji/
		);
	});

	it('needs a picture while Guests is on', () => {
		const guests = { ...valid, for_guests: true };
		expect(validateForm(guests, { hasPicture: false })).toEqual({ image: PICTURE_NEEDED });
		expect(validateForm(guests, { hasPicture: true })).toEqual({});
	});

	it('keeps an odd emoji saved long ago unless it is changed', () => {
		const start = { ...valid, emoji: '🐐🐐' };
		expect(validateForm({ ...start, name: 'Goats' }, { start, hasPicture: true })).toEqual({});
		expect(validateForm({ ...start, emoji: ' 🐐🐐 ' }, { start, hasPicture: true })).toEqual({});
		expect(validateForm({ ...start, emoji: '🐐🐐🐐' }, { start, hasPicture: true }).emoji).toMatch(
			/just one emoji/
		);
		// An empty one is never kept: PocketBase requires an emoji.
		expect(
			validateForm({ ...valid, emoji: '' }, { start: { ...valid, emoji: '' }, hasPicture: true })
				.emoji
		).toBe('Please choose an emoji.');
	});
});

describe('isNameEmojiTaken', () => {
	it("spots PocketBase's unique (name, emoji) error", () => {
		// What PocketBase 0.26 answers for a second "Rocket 🚀".
		const error = new ClientResponseError({
			status: 400,
			response: {
				message: 'Failed to create record.',
				data: {
					emoji: { code: 'validation_not_unique', message: 'Value must be unique.' },
					name: { code: 'validation_not_unique', message: 'Value must be unique.' }
				}
			}
		});
		expect(isNameEmojiTaken(error)).toBe(true);
		expect(takenMessage('Rocket')).toBe("There's already an icon called Rocket with that emoji.");
	});

	it('ignores other errors', () => {
		const required = new ClientResponseError({
			status: 400,
			response: { data: { name: { code: 'validation_required', message: 'Cannot be blank.' } } }
		});
		expect(isNameEmojiTaken(required)).toBe(false);
		expect(isNameEmojiTaken(new ClientResponseError({ status: 0 }))).toBe(false);
		expect(isNameEmojiTaken(new Error('nope'))).toBe(false);
	});
});
