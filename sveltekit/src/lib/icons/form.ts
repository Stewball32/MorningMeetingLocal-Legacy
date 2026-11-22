// The Add / Edit icon form: its values, validation and the record fields it saves (the shared
// form helpers are in #lib/editor/form.ts).
import { validationCodes } from '#lib/editor/errors.ts';
import { sameValues, type FieldErrors } from '#lib/editor/form.ts';
import type { IconRecord } from '#lib/pb/types.ts';
import { emojiProblem } from './emoji.ts';
import { USES, type UseField } from './uses.ts';

/** What the form holds while the teacher types: text exactly as typed, and one switch per use. */
export type IconFormValues = { name: string; emoji: string } & Record<UseField, boolean>;

export type FormField = keyof IconFormValues | 'image';
export type FormErrors = FieldErrors<FormField>;

/** The record fields the form writes (the picture is handled separately). */
export type IconFields = Pick<IconRecord, 'name' | 'emoji' | UseField>;

const allSwitches = (on: boolean) =>
	Object.fromEntries(USES.map((use) => [use.field, on])) as Record<UseField, boolean>;

/** A new icon: every switch off unless the preset turns one on (e.g. "Add guest icon"). */
export function emptyForm(preset: Partial<IconFormValues> = {}): IconFormValues {
	return { name: '', emoji: '', ...allSwitches(false), ...preset };
}

export function formFromIcon(icon: IconRecord): IconFormValues {
	const values = emptyForm({ name: icon.name ?? '', emoji: icon.emoji ?? '' });
	for (const use of USES) values[use.field] = !!icon[use.field];
	return values;
}

/** The picture message while Guests is on and the icon has (or will have) no picture. */
export const PICTURE_NEEDED = 'Guests need a picture: choose one, or turn off Guests.';

export interface ValidateOptions {
	/**
	 * What the form started with when editing an icon: the emoji is then only checked once it is
	 * changed, so an odd one saved long ago (say two emoji) doesn't block saving the rest; it is
	 * kept as it is.
	 */
	start?: IconFormValues;
	/** Whether the icon has a picture once saved (a new one chosen, or the saved one kept). */
	hasPicture: boolean;
}

/** Checks the form. */
export function validateForm(values: IconFormValues, { start, hasPicture }: ValidateOptions) {
	const errors: FormErrors = {};
	if (!values.name.trim()) errors.name = 'Please enter a name.';
	const emojiChanged = !start || values.emoji.trim() !== start.emoji.trim();
	if (!values.emoji.trim()) errors.emoji = 'Please choose an emoji.';
	else if (emojiChanged) {
		const problem = emojiProblem(values.emoji);
		if (problem) errors.emoji = problem;
	}
	if (values.for_guests && !hasPicture) errors.image = PICTURE_NEEDED;
	return errors;
}

/** The record fields for valid form values (run validateForm first). */
export function fieldsFromForm(values: IconFormValues): IconFields {
	const fields = { name: values.name.trim(), emoji: values.emoji.trim() } as IconFields;
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
	emoji: 'emoji',
	image: 'image',
	...Object.fromEntries(USES.map((use) => [use.field, use.field]))
};

/**
 * Whether PocketBase refused a save because another icon already has this name and emoji (the
 * unique index on (name, emoji) reports both fields).
 */
export function isNameEmojiTaken(error: unknown): boolean {
	const codes = validationCodes(error);
	return codes.name === 'validation_not_unique' || codes.emoji === 'validation_not_unique';
}

/** The message for isNameEmojiTaken. */
export const takenMessage = (name: string) =>
	`There's already an icon called ${name} with that emoji.`;
