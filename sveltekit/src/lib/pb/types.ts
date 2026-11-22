import type { RecordModel } from 'pocketbase';
import type {
	ClassProps as ClassAttendanceProps,
	TeacherProps as TeacherAttendanceProps,
	StudentProps as StudentAttendanceProps
} from '#lib/slides/attendance/_types.ts';
import type { ClassProps as ClassCalendarProps } from '#lib/slides/calendar/_types.ts';

export interface ClassDaily extends RecordModel {
	date: string; // YYYY-MM-DD
	slide: number;
	attendance: ClassAttendanceProps;
	calendar: ClassCalendarProps;
}

/** A row of the `people` collection: every student and teacher, including regular guests. */
export interface Person extends RecordModel {
	name: string;
	role: 'student' | 'teacher';
	title?: string; // e.g. "Mr."; shown in front of a teacher's name
	pronoun?: 'he' | 'she' | '';
	video_id?: string; // YouTube video ID for the welcome video
	video_start?: number; // seconds
	video_end?: number; // seconds
	avatar?: string; // file name in this record's storage
	is_guest: boolean; // only offered in the guest list, never on the student/teacher pages
	active: boolean; // false hides the person everywhere on the slides
}

export interface DailyRecord extends RecordModel {
	date: string;
	here: 'present' | 'absent' | '';
	// feelings: string[];
	// weather: string[];
}

/** A row of `people_dailies`: one person's attendance on one date (unique per date + person). */
export interface PersonDaily extends DailyRecord {
	person: string; // Person.id
	attendance?: StudentAttendanceProps | TeacherAttendanceProps | null;
	feelings?: string[];
}

/**
 * A row of `icons`: a picture with a name and an emoji, unique per (name, emoji). The `for_*`
 * switches say where it is offered.
 */
export interface IconRecord extends RecordModel {
	name: string;
	emoji: string; // one emoji; shown in the Add Guest lists
	image: string; // file name in this record's storage; '' when it has no picture
	for_guests: boolean; // offered to one-off guests (Add Guest)
	for_calendar: boolean; // offered to calendar observances
}

export interface GuestDaily extends DailyRecord {
	name: string; // as saved at check-in; a regular guest is shown with their current name
	avatar: string; // IconRecord.id, or '' when the guest is a person with their own picture
	pronoun?: 'he' | 'she' | '';
	// Person.id when a regular guest (is_guest) was checked in, '' otherwise. A person checks in at
	// most once a day, and deleting them deletes their check-ins.
	person?: string;
}

/**
 * A row of `calendar_observances`. Two kinds:
 * - no `dates`: settings for the built-in (date-holidays, US) holiday of the same `name`;
 * - with `dates`: the class's own observance on those days.
 */
export interface CalendarObservance extends RecordModel {
	name: string;
	description: string; // notes for the teacher; not shown on the slides
	is_active: boolean; // false: the record is ignored (PocketBase's default)
	/**
	 * 'YYYY-MM-DD' (that year only) or 'MM-DD' (every year). Empty for a built-in holiday's
	 * settings; PocketBase returns null for a record whose dates were never set.
	 */
	dates: string[];
	image: string; // file name of its own picture in this record's storage; '' for none
	icon?: string; // IconRecord.id, the picture to show when it has none of its own; '' for none
	hidden?: boolean; // on a built-in holiday's settings: hide that holiday from the calendar
	exceptions?: unknown; // an unused JSON field (null)
	/** The school day: 'none' (No School!), 'short' (Short Day!), 'full'; '' when never set. */
	school: 'full' | 'short' | 'none' | '';
	expand?: { icon?: IconRecord }; // with `expand: 'icon'`
}
