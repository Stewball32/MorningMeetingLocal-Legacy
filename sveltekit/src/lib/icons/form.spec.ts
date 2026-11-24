import { describe, expect, it } from 'vitest';
import { ClientResponseError } from 'pocketbase';
import { changedFields } from '#lib/editor/form.ts';
import type { IconRecord } from '#lib/pb/types.ts';
import {
	emptyForm,
	FORM_FIELD_OF,
	fieldsFromForm,
	formFromIcon,
	iconWithName,
	isNameTaken,
	PICTURE_NEEDED,
	PICTURE_REQUIRED,
	PICTURE_RULES,
	sameForm,
	takenMessage,
	validateForm
} from './form.ts';

const rocket = {
	id: 'mh7f9dlc7939t2o',
	collectionId: 'pbc_423132189',
	collectionName: 'icons',
	name: 'Rocket',
	image: 'icon1.png',
	for_guests: true,
	for_calendar: false
} as IconRecord;

const dog = { ...rocket, id: 'dog000000000001', name: 'Dog', image: 'dog.png' } as IconRecord;

describe('form values', () => {
	it('starts empty with every switch off, or with a preset', () => {
		expect(emptyForm()).toEqual({ name: '', for_guests: false, for_calendar: false });
		expect(emptyForm({ for_calendar: true }).for_calendar).toBe(true);
	});

	it('reads an icon', () => {
		expect(formFromIcon(rocket)).toEqual({ name: 'Rocket', for_guests: true, for_calendar: false });
	});

	it('trims the name when saving', () => {
		expect(fieldsFromForm({ ...formFromIcon(rocket), name: '  Big rocket ' })).toEqual({
			name: 'Big rocket',
			for_guests: true,
			for_calendar: false
		});
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
		for (const field of ['name', 'image', 'for_guests', 'for_calendar'])
			expect(FORM_FIELD_OF[field]).toBe(field);
		expect(Object.keys(FORM_FIELD_OF)).not.toContain('emoji');
	});
});

describe('iconWithName', () => {
	const icons = [rocket, dog];

	it('finds the icon with the same name, not counting upper and lower case', () => {
		expect(iconWithName('Dog', icons)).toBe(dog);
		expect(iconWithName('dog', icons)).toBe(dog);
		expect(iconWithName('DOG', icons)).toBe(dog);
		expect(iconWithName('rOcKeT', icons)).toBe(rocket);
	});

	it('does not count spaces around the name', () => {
		expect(iconWithName('  dog ', icons)).toBe(dog);
		expect(iconWithName('Dog', [{ ...dog, name: ' Dog  ' }])?.id).toBe(dog.id);
	});

	it('only takes the whole name', () => {
		expect(iconWithName('Dogs', icons)).toBeUndefined();
		expect(iconWithName('Do g', icons)).toBeUndefined();
		expect(iconWithName('Dog 2', icons)).toBeUndefined();
	});

	it('leaves out the icon being edited, and finds nothing for no name', () => {
		expect(iconWithName('dog', icons, dog.id)).toBeUndefined();
		expect(iconWithName('dog', icons, rocket.id)).toBe(dog);
		expect(iconWithName('   ', icons)).toBeUndefined();
		expect(iconWithName('Dog', [])).toBeUndefined();
	});

	it('says which name is taken, as saved', () => {
		expect(takenMessage('Dog')).toBe(
			"There's already an icon called “Dog”. Please choose another name."
		);
		expect(takenMessage(' Dog ')).toBe(takenMessage('Dog'));
	});
});

describe('validateForm', () => {
	const valid = { name: 'Rocket', for_guests: false, for_calendar: true };

	it('accepts a new icon with a name and a picture', () => {
		expect(validateForm(valid, { hasPicture: true })).toEqual({});
		expect(validateForm({ ...valid, for_guests: true }, { hasPicture: true })).toEqual({});
	});

	it('needs a name', () => {
		expect(validateForm({ ...valid, name: '  ' }, { hasPicture: true })).toEqual({
			name: 'Please enter a name.'
		});
	});

	it('refuses a name another icon has, not counting case and spaces around it', () => {
		const icons = [dog];
		for (const name of ['Dog', 'dog', ' DOG ', '\tdOg'])
			expect(validateForm({ ...valid, name }, { hasPicture: true, icons }), name).toEqual({
				name: takenMessage('Dog')
			});
		expect(validateForm({ ...valid, name: 'Dog 2' }, { hasPicture: true, icons })).toEqual({});
	});

	it("lets an icon keep its own name, or change only the name's case", () => {
		const icons = [dog, rocket];
		const editing = dog;
		expect(validateForm({ ...valid, name: 'Dog' }, { editing, hasPicture: true, icons })).toEqual(
			{}
		);
		expect(validateForm({ ...valid, name: 'DOG' }, { editing, hasPicture: true, icons })).toEqual(
			{}
		);
		expect(
			validateForm({ ...valid, name: 'rocket' }, { editing, hasPicture: true, icons }).name
		).toBe(takenMessage('Rocket'));
	});

	it('needs a picture for a new icon', () => {
		expect(validateForm(valid, { hasPicture: false })).toEqual({ image: PICTURE_REQUIRED });
		// Guests on too: the same message (a new icon needs one either way).
		expect(validateForm({ ...valid, for_guests: true }, { hasPicture: false })).toEqual({
			image: PICTURE_REQUIRED
		});
		expect(PICTURE_REQUIRED).toBe(
			"Please choose a picture: it's what guests and the calendar show."
		);
	});

	it('lets an icon saved without a picture be renamed and saved as it is', () => {
		const old = { ...rocket, image: '', for_guests: false, for_calendar: true } as IconRecord;
		expect(
			validateForm({ ...valid, name: 'Old rocket' }, { editing: old, hasPicture: false })
		).toEqual({});
	});

	it('still needs a picture while Guests is on (guest buttons show it)', () => {
		const guests = { ...valid, for_guests: true };
		expect(validateForm(guests, { editing: rocket, hasPicture: false })).toEqual({
			image: PICTURE_NEEDED
		});
		expect(validateForm(guests, { editing: rocket, hasPicture: true })).toEqual({});
	});

	it('lists the picture messages it gives', () => {
		expect(PICTURE_RULES).toEqual([PICTURE_REQUIRED, PICTURE_NEEDED]);
	});
});

describe('isNameTaken', () => {
	it("spots PocketBase's unique name error", () => {
		// What PocketBase 0.26 answers for a second "dog" (idx_icons_name, COLLATE NOCASE).
		const error = new ClientResponseError({
			status: 400,
			response: {
				message: 'Failed to create record.',
				data: { name: { code: 'validation_not_unique', message: 'Value must be unique.' } }
			}
		});
		expect(isNameTaken(error)).toBe(true);
	});

	it('ignores other errors', () => {
		const required = new ClientResponseError({
			status: 400,
			response: { data: { name: { code: 'validation_required', message: 'Cannot be blank.' } } }
		});
		const otherField = new ClientResponseError({
			status: 400,
			response: {
				data: { image: { code: 'validation_not_unique', message: 'Value must be unique.' } }
			}
		});
		expect(isNameTaken(required)).toBe(false);
		expect(isNameTaken(otherField)).toBe(false);
		expect(isNameTaken(new ClientResponseError({ status: 0 }))).toBe(false);
		expect(isNameTaken(new Error('nope'))).toBe(false);
	});
});
