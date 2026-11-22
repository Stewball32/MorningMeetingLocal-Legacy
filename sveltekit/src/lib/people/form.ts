// The Add / Edit person form: its values, validation and the record fields it saves.
import type { Person } from '#lib/pb/types.ts';
import { formatTime, parseTime, parseYouTube } from './youtube.ts';

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

export function validateForm(values: PersonFormValues): FormErrors {
	const errors: FormErrors = {};
	if (!values.name.trim()) errors.name = 'Please enter a name.';
	if (values.role !== 'student' && values.role !== 'teacher')
		errors.role = 'Choose Student or Teacher.';

	if (parseYouTube(values.video).kind === 'invalid')
		errors.video = "That doesn't look like a YouTube link or video ID.";

	const start = parseTime(values.start);
	const end = parseTime(values.end);
	if (values.start.trim() && start === undefined) errors.start = TIME_HELP;
	if (values.end.trim() && end === undefined) errors.end = TIME_HELP;
	if (start !== undefined && end !== undefined && end <= start)
		errors.end = `The end must be after the start (${formatTime(start)}).`;
	return errors;
}

/** The record fields for valid form values (run validateForm first). */
export function fieldsFromForm(values: PersonFormValues): PersonFields {
	const video = parseYouTube(values.video);
	return {
		name: values.name.trim(),
		role: values.role,
		// A title only belongs to teachers; it stays in the form in case the role is switched back.
		title: values.role === 'teacher' ? values.title.trim() : '',
		pronoun: values.pronoun,
		video_id: video.kind === 'video' ? video.id : '',
		video_start: parseTime(values.start) ?? 0,
		video_end: parseTime(values.end) ?? 0,
		is_guest: values.is_guest,
		active: values.active
	};
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
