// The Add / Edit person form: its values, validation and the record fields it saves.
import type { Person } from '#lib/pb/types.ts';
import { MAX_SECONDS, formatTime, parseTime, parseYouTube } from './youtube.ts';

/** What the form holds while the teacher types: text exactly as typed, so nothing is lost. */
export interface PersonFormValues {
	name: string;
	role: Person['role'];
	title: string;
	pronoun: '' | 'he' | 'she';
	/** a YouTube link or a bare video ID */
	video: string;
	/** seconds, or m:ss */
	start: string;
	end: string;
	is_guest: boolean;
	active: boolean;
}

export type FormField = keyof PersonFormValues | 'avatar';
export type FormErrors = Partial<Record<FormField, string>>;

/** The record fields the form writes (the picture is handled separately). */
export type PersonFields = Pick<
	Person,
	| 'name'
	| 'role'
	| 'title'
	| 'pronoun'
	| 'video_id'
	| 'video_start'
	| 'video_end'
	| 'is_guest'
	| 'active'
>;

/** A new person: Active is on, so they show up on the slides straight away. */
export function emptyForm(preset: Partial<PersonFormValues> = {}): PersonFormValues {
	return {
		name: '',
		role: 'student',
		title: '',
		pronoun: '',
		video: '',
		start: '',
		end: '',
		is_guest: false,
		active: true,
		...preset
	};
}

/** PocketBase stores an unset number as 0; the slides treat 0 as "not set" too. */
const secondsText = (value: number | undefined) => (value ? String(value) : '');

export function formFromPerson(person: Person): PersonFormValues {
	return {
		name: person.name ?? '',
		role: person.role === 'teacher' ? 'teacher' : 'student',
		title: person.title ?? '',
		pronoun: person.pronoun === 'he' || person.pronoun === 'she' ? person.pronoun : '',
		video: person.video_id ?? '',
		start: secondsText(person.video_start),
		end: secondsText(person.video_end),
		is_guest: !!person.is_guest,
		active: !!person.active
	};
}

const TIME_HELP = 'Use seconds (like 90) or minutes:seconds (like 1:30).';
const TOO_LONG = `Times can be up to 24 hours (${formatTime(MAX_SECONDS)}).`;

/** Whether the teacher changed this field (spaces around it don't count). */
const edited = (
	values: PersonFormValues,
	start: PersonFormValues | undefined,
	field: 'video' | 'start' | 'end'
) => !start || values[field].trim() !== start[field].trim();

/**
 * Checks the form. `start` is what the form started with when editing someone: the video and
 * times are only checked once they are changed, so an odd value saved long ago (say a video ID
 * that isn't 11 characters) doesn't block saving the rest; it is kept as it is.
 */
export function validateForm(values: PersonFormValues, start?: PersonFormValues): FormErrors {
	const errors: FormErrors = {};
	if (!values.name.trim()) errors.name = 'Please enter a name.';
	if (values.role !== 'student' && values.role !== 'teacher')
		errors.role = 'Choose Student or Teacher.';

	if (edited(values, start, 'video') && parseYouTube(values.video).kind === 'invalid')
		errors.video = "That doesn't look like a YouTube link or video ID.";

	if (!edited(values, start, 'start') && !edited(values, start, 'end')) return errors;
	const from = parseTime(values.start);
	const to = parseTime(values.end);
	if (values.start.trim() && from === undefined) errors.start = TIME_HELP;
	else if (from !== undefined && from > MAX_SECONDS) errors.start = TOO_LONG;
	if (values.end.trim() && to === undefined) errors.end = TIME_HELP;
	else if (to !== undefined && to > MAX_SECONDS) errors.end = TOO_LONG;
	else if (from !== undefined && to !== undefined && to <= from)
		errors.end = `The end must be after the start (${formatTime(from)}).`;
	return errors;
}

/** The record fields for valid form values (run validateForm first). */
export function fieldsFromForm(values: PersonFormValues): PersonFields {
	const video = parseYouTube(values.video);
	// Without a video there is nothing to start or end.
	const timed = video.kind !== 'empty';
	return {
		name: values.name.trim(),
		role: values.role,
		// A title only belongs to teachers; it stays in the form in case the role is switched back.
		title: values.role === 'teacher' ? values.title.trim() : '',
		pronoun: values.pronoun,
		// An unreadable video only gets past validateForm unchanged: then it is kept as it was.
		video_id: video.kind === 'video' ? video.id : values.video.trim(),
		video_start: (timed && parseTime(values.start)) || 0,
		video_end: (timed && parseTime(values.end)) || 0,
		is_guest: values.is_guest,
		active: values.active
	};
}

/** Whether two sets of form values are the same (ignoring spaces around text). */
export function sameForm(a: PersonFormValues, b: PersonFormValues): boolean {
	return (Object.keys(a) as (keyof PersonFormValues)[]).every((field) =>
		typeof a[field] === 'string'
			? String(a[field]).trim() === String(b[field]).trim()
			: a[field] === b[field]
	);
}

/** How a save went: a new person, saved changes, or nothing to save. */
export type SaveOutcome = 'created' | 'saved' | 'unchanged';

/**
 * The fields that differ between two versions. Saving only these means a change made meanwhile
 * in another window (say, Active switched off there) is not overwritten by an edit that never
 * touched it.
 */
export function changedFields(before: PersonFields, after: PersonFields): Partial<PersonFields> {
	const changes: Partial<PersonFields> = {};
	for (const key of Object.keys(after) as (keyof PersonFields)[]) {
		if (before[key] !== after[key]) Object.assign(changes, { [key]: after[key] });
	}
	return changes;
}

/** PocketBase field names -> form fields, for showing its validation errors next to the input. */
export const FORM_FIELD_OF: Record<string, FormField> = {
	name: 'name',
	role: 'role',
	title: 'title',
	pronoun: 'pronoun',
	avatar: 'avatar',
	video_id: 'video',
	video_start: 'start',
	video_end: 'end',
	is_guest: 'is_guest',
	active: 'active'
};
