// The Add / Edit observance form: its values, validation and the record fields it saves (the
// shared form helpers are in #lib/editor/form.ts).
import { changedFields, sameValues, type FieldErrors } from '#lib/editor/form.ts';
import {
	findBuiltIn,
	isSettingsRecord,
	otherHolidayName,
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
	/** A built-in holiday's name on the calendar ('' for its own name). */
	displayName: string;
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

/**
 * The record fields the form writes (the uploaded picture is handled separately). `dates` may
 * hold entries written in the PocketBase dashboard that aren't text: they are saved back as they
 * were (see savedDates).
 */
export type ObservanceFields = Pick<
	CalendarObservance,
	'name' | 'school' | 'description' | 'is_active'
> & { dates: unknown[]; hidden: boolean; icon: string; display_name: string };

/** The most a built-in holiday's name on the calendar can have (the field's max). */
export const MAX_DISPLAY_NAME = 100;

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
		displayName: '',
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
	// || not ??: PocketBase gives '' when it was never set. A record the calendar ignores (no days,
	// no holiday by its name) keeps the one it holds, in case it is made a holiday's changes; your
	// own days have none.
	const saved = isSettingsRecord(record) ? record.display_name || '' : '';
	return {
		kind: holiday ? 'builtin' : 'custom',
		holiday: holiday?.name ?? '',
		displayName: holiday ? otherHolidayName(saved, holiday.name) : saved.trim(),
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
	/**
	 * A day (or days in a row) picked in the days list but not added, in words (DaysEditor's
	 * pendingPick); '' or left out when there is none. Saving would leave it out.
	 */
	pendingDays?: string;
}

export function validateForm(values: ObservanceFormValues, context: ValidateContext): FormErrors {
	const errors: FormErrors = {};
	if (values.kind === 'builtin') {
		const holiday = values.holiday ? findBuiltIn(context.holidays, values.holiday) : undefined;
		if (!holiday) errors.holiday = 'Please choose the holiday to change.';
		else if (context.takenBy)
			errors.holiday = `You've already changed ${holiday.name}. Edit those changes instead.`;
		// In characters, as PocketBase counts them (an emoji is one).
		if ([...values.displayName.trim()].length > MAX_DISPLAY_NAME)
			errors.displayName = `Please keep the name to ${MAX_DISPLAY_NAME} characters or fewer.`;
	} else {
		if (!values.name.trim()) errors.name = 'Please enter a name.';
		if (context.pendingDays) errors.entries = context.pendingDays;
		else if (values.entries.length === 0) errors.entries = 'Please add at least one day.';
	}
	if (!['none', 'short', 'full'].includes(values.school))
		errors.school = 'Choose No school, Short day or Regular day.';
	if (values.picture === 'icon' && !values.icon)
		errors.icon = 'Please choose an icon, or another picture option.';
	if (values.picture === 'upload' && !context.hasUpload)
		errors.image = 'Please choose a picture to upload, or another picture option.';
	return errors;
}

/**
 * A built-in holiday's name on the calendar as saved: '' when it is left empty or is the
 * holiday's own name (apostrophes and spaces around it don't count), so it shows as it comes.
 * The calendar reads a saved one the same way (otherHolidayName).
 */
export const displayNameField = (displayName: string, holiday: string): string =>
	otherHolidayName(displayName, holiday);

/** The record fields for valid form values (run validateForm first). */
export function fieldsFromForm(
	values: ObservanceFormValues,
	holidays: readonly BuiltInHoliday[]
): ObservanceFields {
	const builtIn = values.kind === 'builtin';
	const holiday = findBuiltIn(holidays, values.holiday)?.name ?? values.holiday;
	return {
		// The built-in holiday's name as the slide shows it (plain apostrophes), so it matches.
		name: builtIn ? holiday : values.name.trim(),
		// Only a built-in holiday has another name: your own day's name is `name`.
		display_name: builtIn ? displayNameField(values.displayName, holiday) : '',
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
 * Whether new changes to a built-in holiday leave it as it comes: its own name (left empty, or
 * typed in), its own school day, the default picture, no notes, used and not hidden. A record of
 * them would change nothing on the calendar, yet give the holiday a Reset button, so the form
 * saves nothing ("No changes to save"), as for an edit that changed nothing. Your own day always
 * has something to save (a name and days).
 */
export function leavesAsItComes(
	values: ObservanceFormValues,
	holidays: readonly BuiltInHoliday[]
): boolean {
	if (values.kind !== 'builtin') return false;
	const asItComes = emptyForm({ kind: 'builtin', holiday: values.holiday }, holidays);
	const changes = changedFields(
		fieldsFromForm(asItComes, holidays),
		fieldsFromForm(values, holidays)
	);
	return Object.keys(changes).length === 0;
}

/**
 * The record as it is saved, in the fields the form writes: to compare with
 * fieldsFromForm(values), so only what changed is sent (changedFields). These are the fields of
 * the form's starting values, except the name on the calendar: that is the one the record really
 * holds, read the way the calendar reads it for the holiday chosen now. The form doesn't always
 * start with it (a record the calendar ignored, made a holiday's changes), and emptying the field
 * must still clear it; one that is just the holiday's own name needs no change.
 */
export function savedFields(
	record: CalendarObservance,
	initial: ObservanceFormValues,
	values: ObservanceFormValues,
	holidays: readonly BuiltInHoliday[]
): ObservanceFields {
	const before = fieldsFromForm(initial, holidays);
	const after = fieldsFromForm(values, holidays);
	return {
		...before,
		// Only a built-in holiday's changes use it: for your own day it is left as it is.
		display_name:
			values.kind === 'builtin'
				? otherHolidayName(record.display_name || '', after.name)
				: after.display_name
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
		display_name: 'displayName',
		dates: 'entries',
		school: 'school',
		description: 'notes',
		is_active: 'active',
		hidden: 'hidden',
		icon: 'icon',
		image: 'image'
	};
}
