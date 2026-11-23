// The Add / Edit person form: its values, validation and the record fields it saves (the shared
// form helpers are in #lib/editor/form.ts).
import { birthdayValue, daysInBirthdayMonth, MONTH_NAMES, parseBirthday } from '#lib/birthdays.ts';
import { sameValues, type FieldErrors } from '#lib/editor/form.ts';
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
	/** The birthday's month, '1'-'12' as the select gives it; '' for no birthday. */
	birthdayMonth: string;
	/** The birthday's day, '1'-'31'; '' until one is chosen. */
	birthdayDay: string;
	is_guest: boolean;
	active: boolean;
}

/** The Birthday's two selects share one message, 'birthday'. */
export type FormField = keyof PersonFormValues | 'avatar' | 'birthday';
export type FormErrors = FieldErrors<FormField>;

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
> & { birthday: string };

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
		birthdayMonth: '',
		birthdayDay: '',
		is_guest: false,
		active: true,
		...preset
	};
}

/** PocketBase stores an unset number as 0; the slides treat 0 as "not set" too. */
const secondsText = (value: number | undefined) => (value ? String(value) : '');

export function formFromPerson(person: Person): PersonFormValues {
	// A birthday that isn't a real day (typed in the dashboard) shows as none, and is kept as it is
	// unless one is chosen (fieldsFromForm then gives '' before and after: nothing is sent).
	const birthday = parseBirthday(person.birthday);
	return {
		name: person.name ?? '',
		role: person.role === 'teacher' ? 'teacher' : 'student',
		title: person.title ?? '',
		pronoun: person.pronoun === 'he' || person.pronoun === 'she' ? person.pronoun : '',
		video: person.video_id ?? '',
		start: secondsText(person.video_start),
		end: secondsText(person.video_end),
		birthdayMonth: birthday ? String(birthday.month) : '',
		birthdayDay: birthday ? String(birthday.day) : '',
		is_guest: !!person.is_guest,
		active: !!person.active
	};
}

/** A saved birthday the form can't show: not a real day, e.g. '04-31' ('' when there is none). */
export function unreadableBirthday(person: Pick<Person, 'birthday'> | null | undefined): string {
	const saved = person?.birthday?.trim() ?? '';
	return saved && !parseBirthday(saved) ? saved : '';
}

/** The days the Day select offers for a month ('1'-'12'): 1-31 (February: up to 29); none without. */
export function birthdayDayChoices(month: string): number[] {
	const number = Number(month);
	if (!month || !(number >= 1 && number <= 12)) return [];
	return Array.from({ length: daysInBirthdayMonth(number) }, (_, index) => index + 1);
}

/** Choosing another month: '—' clears the birthday; a day the month hasn't got is cleared. */
export function withBirthdayMonth(values: PersonFormValues, month: string): PersonFormValues {
	const days = birthdayDayChoices(month);
	const keepDay = days.includes(Number(values.birthdayDay));
	return { ...values, birthdayMonth: month, birthdayDay: keepDay ? values.birthdayDay : '' };
}

/** How long the Day select waits for the next digit of a day (as long as a select's own search). */
export const DAY_TYPING_MS = 1000;

/**
 * Typing a day into the Day select, one digit at a time. A select's own search cycles through
 * the days that start with a digit typed twice, so "22" would give 20; here the digits typed in a
 * row make the day: "2", "2" gives 22, "3", "0" gives 30. A digit that would make a day the month
 * hasn't got starts a new one ("3", "1" in November: 1); a "0" first waits for the next digit
 * ("0", "5": 5). `typed` is the digits so far ('' after a pause); `day` is undefined when none is
 * chosen yet.
 */
export function typedDay(
	typed: string,
	digit: string,
	days: readonly number[]
): { typed: string; day?: number } {
	for (const digits of [typed + digit, digit]) {
		const day = Number(digits);
		if (days.includes(day)) return { typed: digits, day };
	}
	return { typed: digit === '0' && days.length > 0 ? '0' : '' };
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

	// Both or neither: "—" as the month means no birthday.
	const month = Number(values.birthdayMonth);
	if (values.birthdayMonth && !values.birthdayDay)
		errors.birthday = 'Please choose the day too, or “—” as the month for no birthday.';
	else if (!values.birthdayMonth && values.birthdayDay)
		errors.birthday = 'Please choose the month too.';
	else if (values.birthdayMonth && !birthdayValue(month, Number(values.birthdayDay)))
		errors.birthday = MONTH_NAMES[month - 1]
			? `${MONTH_NAMES[month - 1]} has only ${daysInBirthdayMonth(month)} days. Please choose another day.`
			: 'Please choose the month from the list.';

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
		// 'MM-DD', or '' for none
		birthday:
			values.birthdayMonth && values.birthdayDay
				? birthdayValue(Number(values.birthdayMonth), Number(values.birthdayDay))
				: '',
		is_guest: values.is_guest,
		active: values.active
	};
}

/** Whether two sets of form values are the same (ignoring spaces around text). */
export function sameForm(a: PersonFormValues, b: PersonFormValues): boolean {
	return sameValues(a, b);
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
	birthday: 'birthday',
	is_guest: 'is_guest',
	active: 'active'
};
