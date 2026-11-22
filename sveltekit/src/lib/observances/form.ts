// The Add / Edit observance form: its values, validation and the record fields it saves (the
// shared form helpers are in #lib/editor/form.ts).
import { sameValues, type FieldErrors } from '#lib/editor/form.ts';
import {
	findBuiltIn,
	isSettingsRecord,
	type BuiltInHoliday,
	type School
} from '#lib/pb/calendar.ts';
import type { FileChange } from '#lib/pb/requests.ts';
import type { CalendarObservance } from '#lib/pb/types.ts';
import { savedDates, type DayEntry } from './dates.ts';
import { entriesOf, schoolOf } from './observances.ts';

/** Changing a built-in holiday (a settings record with no dates), or the class's own day(s). */
export type Kind = 'builtin' | 'custom';

/** Where the picture comes from: the calendar's default, an icon, or one uploaded for it. */
export type PictureChoice = 'default' | 'icon' | 'upload';

/** What the form holds while the teacher types: text exactly as typed, so nothing is lost. */
export interface ObservanceFormValues {
	kind: Kind;
	/** The built-in holiday's name ('' until one is chosen). */
	holiday: string;
	/** The name of the class's own day. */
	name: string;
	entries: DayEntry[];
	school: School;
	picture: PictureChoice;
	/** IconRecord.id (used when `picture` is 'icon'). */
	icon: string;
	notes: string;
	active: boolean;
	hidden: boolean;
}

export type FormField = keyof ObservanceFormValues | 'image';
export type FormErrors = FieldErrors<FormField>;

/** The record fields the form writes (the uploaded picture is handled separately). */
export type ObservanceFields = Pick<
	CalendarObservance,
	'name' | 'dates' | 'school' | 'description' | 'is_active'
> & { hidden: boolean; icon: string };

/** Starting values for a new record (e.g. "Customize" on a built-in holiday). */
export interface FormPreset {
	kind?: Kind;
	holiday?: string;
}

/** A new record: shown on the calendar straight away, with the holiday's own school day. */
export function emptyForm(
	preset: FormPreset,
	holidays: readonly BuiltInHoliday[]
): ObservanceFormValues {
	const holiday = preset.holiday ? findBuiltIn(holidays, preset.holiday) : undefined;
	return {
		kind: preset.kind ?? (holiday ? 'builtin' : 'custom'),
		holiday: holiday?.name ?? '',
		name: '',
		entries: [],
		school: holiday?.school ?? 'full',
		picture: 'default',
		icon: '',
		notes: '',
		active: true,
		hidden: false
	};
}

/** Which built-in holiday a record changes (a record with no dates, named like one). */
export function builtInOf(
	record: CalendarObservance,
	holidays: readonly BuiltInHoliday[]
): BuiltInHoliday | undefined {
	return isSettingsRecord(record) ? findBuiltIn(holidays, record.name ?? '') : undefined;
}

export function formFromRecord(
	record: CalendarObservance,
	holidays: readonly BuiltInHoliday[],
	today: Date
): ObservanceFormValues {
	const holiday = builtInOf(record, holidays);
	return {
		kind: holiday ? 'builtin' : 'custom',
		holiday: holiday?.name ?? '',
		name: record.name ?? '',
		entries: entriesOf(record, today),
		// A school day that was never set ('') means the holiday's own, or a regular day.
		school: schoolOf(record.school, holiday?.school ?? 'full'),
		picture: record.image ? 'upload' : record.icon ? 'icon' : 'default',
		icon: record.icon ?? '',
		notes: record.description ?? '',
		active: !!record.is_active,
		hidden: !!record.hidden
	};
}

export interface ValidateContext {
	holidays: readonly BuiltInHoliday[];
	/** Another settings record for the chosen built-in holiday (the editor makes one per holiday). */
	takenBy?: CalendarObservance;
	/** For "Upload": a picture is chosen, or the saved one is kept. */
	hasUpload: boolean;
}

export function validateForm(values: ObservanceFormValues, context: ValidateContext): FormErrors {
	const errors: FormErrors = {};
	if (values.kind === 'builtin') {
		const holiday = values.holiday ? findBuiltIn(context.holidays, values.holiday) : undefined;
		if (!holiday) errors.holiday = 'Please choose the holiday to change.';
		else if (context.takenBy)
			errors.holiday = `You've already changed ${holiday.name}. Edit those changes instead.`;
	} else {
		if (!values.name.trim()) errors.name = 'Please enter a name.';
		if (values.entries.length === 0) errors.entries = 'Please add at least one day.';
	}
	if (!['none', 'short', 'full'].includes(values.school))
		errors.school = 'Choose No school, Short day or Regular day.';
	if (values.picture === 'icon' && !values.icon)
		errors.icon = 'Please choose an icon, or another picture option.';
	if (values.picture === 'upload' && !context.hasUpload)
		errors.image = 'Please choose a picture to upload, or another picture option.';
	return errors;
}

/** The record fields for valid form values (run validateForm first). */
export function fieldsFromForm(
	values: ObservanceFormValues,
	holidays: readonly BuiltInHoliday[]
): ObservanceFields {
	const builtIn = values.kind === 'builtin';
	return {
		// The built-in holiday's name as the slide shows it (plain apostrophes), so it matches.
		name: builtIn
			? (findBuiltIn(holidays, values.holiday)?.name ?? values.holiday)
			: values.name.trim(),
		dates: builtIn ? [] : savedDates(values.entries),
		school: values.school,
		description: values.notes.trim(),
		is_active: values.active,
		// Hiding is only for built-in holidays; turning off Show on the calendar hides the class's own.
		hidden: builtIn ? values.hidden : false,
		icon: values.picture === 'icon' ? values.icon : ''
	};
}

/**
 * What to send for the record's own picture: the picker's choice for "Upload"; otherwise remove
 * the saved one (it would win over the icon or the default), or leave it alone if there is none.
 */
export function imageChange(
	picture: PictureChoice,
	picked: FileChange,
	hasSavedImage: boolean
): FileChange {
	if (picture === 'upload') return picked;
	return hasSavedImage ? null : undefined;
}

/** Whether two sets of form values are the same (ignoring spaces around text). */
export function sameForm(a: ObservanceFormValues, b: ObservanceFormValues): boolean {
	const { entries: entriesA, ...restA } = a;
	const { entries: entriesB, ...restB } = b;
	return (
		sameValues(restA, restB) &&
		JSON.stringify(savedDates(entriesA)) === JSON.stringify(savedDates(entriesB))
	);
}

/** PocketBase field names -> form fields, for showing its validation errors next to the input. */
export function formFieldOf(kind: Kind): Record<string, FormField> {
	return {
		name: kind === 'builtin' ? 'holiday' : 'name',
		dates: 'entries',
		school: 'school',
		description: 'notes',
		is_active: 'active',
		hidden: 'hidden',
		icon: 'icon',
		image: 'image'
	};
}
