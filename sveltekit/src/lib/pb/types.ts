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

export interface IconRecord extends RecordModel {
	name: string;
	emoji: string; // emoji
	image: string; // image url
	for_avatar: boolean; // for avatar
	for_calendar: boolean; // for calendar
}

export interface GuestDaily extends DailyRecord {
	name: string; // as saved at check-in; a regular guest is shown with their current name
	avatar: string; // IconRecord.id, or '' when the guest is a person with their own picture
	pronoun?: 'he' | 'she' | '';
	// Person.id when a regular guest (is_guest) was checked in, '' otherwise. A person checks in at
	// most once a day, and deleting them deletes their check-ins.
	person?: string;
}

export interface CalendarObservance extends RecordModel {
	name: string;
	description: string;
	is_active: boolean;
	dates: string[]; // Array of dates in YYYY-MM-DD format
	image: string; // Image URL
	exceptions: JSON; // TODO: Define a more specific type if needed
	school: 'full' | 'short' | 'none'; // Whether this observance is a school day
}
