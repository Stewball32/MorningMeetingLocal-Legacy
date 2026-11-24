// The Add / Edit icon form: its values, validation and the record fields it saves (the shared
// form helpers are in #lib/editor/form.ts).
import { validationCodes } from '#lib/editor/errors.ts';
import { sameValues, type FieldErrors } from '#lib/editor/form.ts';
import type { IconRecord } from '#lib/pb/types.ts';
import { needsPicture } from './icons.ts';
import { USES, type UseField } from './uses.ts';

/** What the form holds while the teacher types: the name exactly as typed, and one switch per use. */
export type IconFormValues = { name: string } & Record<UseField, boolean>;

export type FormField = keyof IconFormValues | 'image';
export type FormErrors = FieldErrors<FormField>;

/** The record fields the form writes (the picture is handled separately). */
export type IconFields = Pick<IconRecord, 'name' | UseField>;

const allSwitches = (on: boolean) =>
	Object.fromEntries(USES.map((use) => [use.field, on])) as Record<UseField, boolean>;

/** A new icon: every switch off unless the preset turns one on (e.g. "Add guest icon"). */
export function emptyForm(preset: Partial<IconFormValues> = {}): IconFormValues {
	return { name: '', ...allSwitches(false), ...preset };
}

export function formFromIcon(icon: IconRecord): IconFormValues {
	const values = emptyForm({ name: icon.name ?? '' });
	for (const use of USES) values[use.field] = !!icon[use.field];
	return values;
}

/** The picture message for a new icon without one. */
export const PICTURE_REQUIRED = "Please choose a picture: it's what guests and the calendar show.";
/** The picture message when Guests is turned on, or the picture removed while it is on. */
export const PICTURE_NEEDED = 'Guests need a picture: choose one, or turn off Guests.';
/** The picture messages validateForm gives (the others come from choosing a picture). */
export const PICTURE_RULES: readonly string[] = [PICTURE_REQUIRED, PICTURE_NEEDED];

/** How names are compared: not counting upper and lower case or spaces around them. */
const nameKey = (name: string) => name.trim().toLowerCase();

/**
 * The other icon that already has this name, not counting upper and lower case or spaces around
 * it ("dog " is taken by "Dog"), or undefined. `exceptId`: the icon being edited.
 */
export function iconWithName(
	name: string,
	icons: readonly Pick<IconRecord, 'id' | 'name'>[],
	exceptId?: string
): Pick<IconRecord, 'id' | 'name'> | undefined {
	const key = nameKey(name);
	if (!key) return undefined;
	return icons.find((icon) => icon.id !== exceptId && nameKey(icon.name ?? '') === key);
}

/** The Name field's message when another icon has the name. */
export const takenMessage = (name: string) =>
	`There's already an icon called “${name.trim()}”. Please choose another name.`;

/** What validateForm needs of the icon being edited: as it was saved when the form opened. */
export type EditedIcon = Pick<IconRecord, 'id' | 'for_guests' | 'image'>;

export interface ValidateOptions {
	/** The icon being edited, as saved; leave it out for a new one (which needs a picture). */
	editing?: EditedIcon;
	/** Whether the icon has a picture once saved (a new one chosen, or the saved one kept). */
	hasPicture: boolean;
	/** Every icon (the page's live list), to check that the name is still free. */
	icons?: readonly Pick<IconRecord, 'id' | 'name'>[];
}

/**
 * Whether the form asks for a picture before saving: always for a new icon (the picture is what
 * tells icons apart on the slides); for an icon being edited, when Guests is on unless the icon
 * was already saved for guests without a picture. So turning Guests on, or removing the picture
 * while it is on, asks for one, but an icon saved without one long ago can still be renamed and
 * saved as it is (guests who pick it show the default picture meanwhile).
 */
export function picturePolicy(
	values: Pick<IconFormValues, 'for_guests'>,
	editing?: EditedIcon
): 'required' | 'needed for guests' | 'optional' {
	if (!editing) return 'required';
	return values.for_guests && !needsPicture(editing) ? 'needed for guests' : 'optional';
}

/** Checks the form (see picturePolicy for when it asks for a picture). */
export function validateForm(
	values: IconFormValues,
	{ editing, hasPicture, icons = [] }: ValidateOptions
) {
	const errors: FormErrors = {};
	if (!values.name.trim()) errors.name = 'Please enter a name.';
	else {
		const other = iconWithName(values.name, icons, editing?.id);
		if (other) errors.name = takenMessage(other.name);
	}
	if (!hasPicture) {
		const policy = picturePolicy(values, editing);
		if (policy === 'required') errors.image = PICTURE_REQUIRED;
		else if (policy === 'needed for guests') errors.image = PICTURE_NEEDED;
	}
	return errors;
}

/** The record fields for valid form values (run validateForm first). */
export function fieldsFromForm(values: IconFormValues): IconFields {
	const fields = { name: values.name.trim() } as IconFields;
	for (const use of USES) fields[use.field] = values[use.field];
	return fields;
}

/** Whether two sets of form values are the same (ignoring spaces around text). */
export function sameForm(a: IconFormValues, b: IconFormValues): boolean {
	return sameValues(a, b);
}

/** PocketBase field names -> form fields, for showing its validation errors next to the input. */
export const FORM_FIELD_OF: Record<string, FormField> = {
	name: 'name',
	image: 'image',
	...Object.fromEntries(USES.map((use) => [use.field, use.field]))
};

/**
 * Whether PocketBase refused a save because another icon already has this name (its unique
 * index on the name, not counting upper and lower case): say another window added it meanwhile.
 */
export function isNameTaken(error: unknown): boolean {
	return validationCodes(error).name === 'validation_not_unique';
}
