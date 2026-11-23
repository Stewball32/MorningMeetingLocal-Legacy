import { describe, expect, it } from 'vitest';
import { changedFields } from '#lib/editor/form.ts';
import type { Person } from '#lib/pb/types.ts';
import {
	birthdayDayChoices,
	DAY_TYPING_MS,
	emptyForm,
	FORM_FIELD_OF,
	fieldsFromForm,
	formFromPerson,
	sameForm,
	typedDay,
	unreadableBirthday,
	validateForm,
	withBirthdayMonth
} from './form.ts';

const record = (fields: Partial<Person>): Person => ({
	id: 'abcdefghijklmno',
	collectionId: 'pbc_1795321340',
	collectionName: 'people',
	name: 'Dora',
	role: 'student',
	title: '',
	pronoun: 'she',
	video_id: 'zenQCKkKEwc',
	video_start: 14,
	video_end: 30,
	is_guest: false,
	active: true,
	...fields
});

describe('emptyForm', () => {
	it('starts a new person as an active student', () => {
		const form = emptyForm();
		expect(form.active).toBe(true);
		expect(form.is_guest).toBe(false);
		expect(form.role).toBe('student');
		expect(form.name).toBe('');
	});

	it('takes presets (e.g. Add teacher, Add guest)', () => {
		expect(emptyForm({ role: 'teacher' }).role).toBe('teacher');
		expect(emptyForm({ is_guest: true }).is_guest).toBe(true);
		expect(emptyForm({ is_guest: true }).active).toBe(true);
	});
});

describe('formFromPerson', () => {
	it('fills every field from the record', () => {
		expect(formFromPerson(record({ role: 'teacher', title: 'Ms.', birthday: '11-05' }))).toEqual({
			name: 'Dora',
			role: 'teacher',
			title: 'Ms.',
			pronoun: 'she',
			video: 'zenQCKkKEwc',
			start: '14',
			end: '30',
			birthdayMonth: '11',
			birthdayDay: '5',
			is_guest: false,
			active: true
		});
	});

	it('shows 0 and missing values as empty fields', () => {
		const form = formFromPerson(
			record({
				title: undefined,
				pronoun: undefined,
				video_id: '',
				video_start: 0,
				video_end: undefined
			})
		);
		expect(form.title).toBe('');
		expect(form.pronoun).toBe('');
		expect(form.video).toBe('');
		expect(form.start).toBe('');
		expect(form.end).toBe('');
	});
});

describe('validateForm', () => {
	const valid = () => emptyForm({ name: 'Finn' });

	it('accepts a name alone', () => {
		expect(validateForm(valid())).toEqual({});
	});

	it('requires a name', () => {
		expect(validateForm(emptyForm()).name).toBeTruthy();
		expect(validateForm(emptyForm({ name: '   ' })).name).toBeTruthy();
	});

	it('rejects a video it cannot read, accepts links and IDs', () => {
		expect(validateForm({ ...valid(), video: 'not a video' }).video).toBeTruthy();
		expect(validateForm({ ...valid(), video: 'https://youtu.be/dQw4w9WgXcQ?t=5' })).toEqual({});
		expect(validateForm({ ...valid(), video: 'dQw4w9WgXcQ' })).toEqual({});
	});

	it('checks start and end times', () => {
		expect(validateForm({ ...valid(), start: 'soon' }).start).toBeTruthy();
		expect(validateForm({ ...valid(), end: '-4' }).end).toBeTruthy();
		expect(validateForm({ ...valid(), start: '1:30', end: '1m45s' })).toEqual({});
		expect(validateForm({ ...valid(), end: '20' })).toEqual({});
		expect(validateForm({ ...valid(), start: '20' })).toEqual({});
	});

	it('wants the end after the start', () => {
		expect(validateForm({ ...valid(), start: '30', end: '30' }).end).toMatch(/after the start/);
		expect(validateForm({ ...valid(), start: '1:30', end: '60' }).end).toMatch(/1:30/);
		expect(validateForm({ ...valid(), start: '30', end: '31' })).toEqual({});
	});

	it('takes times up to 24 hours', () => {
		expect(validateForm({ ...valid(), start: '99999999999999999999' }).start).toMatch(/24 hours/);
		expect(validateForm({ ...valid(), end: '25:00:00' }).end).toMatch(/24 hours/);
		expect(validateForm({ ...valid(), start: '24:00:00' })).toEqual({});
	});

	it('lets an odd value saved long ago through as long as it is not changed', () => {
		const saved = formFromPerson(record({ video_id: 'oldvid', video_start: 40, video_end: 20 }));
		expect(validateForm({ ...saved, name: 'Dora M' }, saved)).toEqual({});
		expect(validateForm({ ...saved, video: ' oldvid ' }, saved)).toEqual({});
		expect(validateForm({ ...saved, video: 'oldvid2' }, saved).video).toBeTruthy();
		expect(validateForm({ ...saved, end: '30' }, saved).end).toMatch(/after the start/);
		// Without the starting values everything is checked.
		expect(validateForm(saved).video).toBeTruthy();
	});
});

describe('sameForm', () => {
	it('compares values, ignoring spaces around text', () => {
		const form = emptyForm({ name: 'Finn' });
		expect(sameForm(form, { ...form })).toBe(true);
		expect(sameForm(form, { ...form, name: ' Finn ' })).toBe(true);
		expect(sameForm(form, { ...form, name: 'Fin' })).toBe(false);
		expect(sameForm(form, { ...form, active: false })).toBe(false);
		expect(sameForm(form, { ...form, pronoun: 'he' })).toBe(false);
	});
});

describe('fieldsFromForm', () => {
	it('builds the record fields', () => {
		const fields = fieldsFromForm({
			name: '  Smith ',
			role: 'teacher',
			title: ' Mr. ',
			pronoun: 'he',
			video: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s',
			start: '1:30',
			end: '100',
			birthdayMonth: '2',
			birthdayDay: '29',
			is_guest: false,
			active: true
		});
		expect(fields).toEqual({
			name: 'Smith',
			role: 'teacher',
			title: 'Mr.',
			pronoun: 'he',
			video_id: 'dQw4w9WgXcQ',
			video_start: 90,
			video_end: 100,
			birthday: '02-29',
			is_guest: false,
			active: true
		});
	});

	it('drops the title for students and stores empty times as 0', () => {
		const fields = fieldsFromForm(emptyForm({ name: 'Bluey', title: 'Dr.', video: '' }));
		expect(fields.title).toBe('');
		expect(fields.video_id).toBe('');
		expect(fields.video_start).toBe(0);
		expect(fields.video_end).toBe(0);
		expect(fields.pronoun).toBe('');
		expect(fields.active).toBe(true);
	});

	it('saves no times without a video', () => {
		const fields = fieldsFromForm(
			emptyForm({ name: 'Bluey', video: ' ', start: '30', end: '1:00' })
		);
		expect(fields.video_id).toBe('');
		expect(fields.video_start).toBe(0);
		expect(fields.video_end).toBe(0);
	});

	it('keeps an unreadable video ID saved long ago as it is', () => {
		const person = record({ video_id: 'oldvid', video_start: 5 });
		expect(fieldsFromForm(formFromPerson(person))).toMatchObject({
			video_id: 'oldvid',
			video_start: 5
		});
		const form = { ...formFromPerson(person), name: 'Dora M' };
		expect(changedFields(fieldsFromForm(formFromPerson(person)), fieldsFromForm(form))).toEqual({
			name: 'Dora M'
		});
	});

	it('round-trips a record', () => {
		const person = record({
			role: 'teacher',
			title: 'Ms.',
			is_guest: true,
			active: false,
			birthday: '12-31'
		});
		const fields = fieldsFromForm(formFromPerson(person));
		expect(fields).toEqual({
			name: person.name,
			role: person.role,
			title: person.title,
			pronoun: person.pronoun,
			video_id: person.video_id,
			video_start: person.video_start,
			video_end: person.video_end,
			birthday: person.birthday,
			is_guest: person.is_guest,
			active: person.active
		});
	});
});

describe('the Birthday field', () => {
	const valid = () => emptyForm({ name: 'Finn' });

	it("starts with none, and reads 'MM-DD' (|| not ??: never set is '')", () => {
		expect(emptyForm()).toMatchObject({ birthdayMonth: '', birthdayDay: '' });
		expect(formFromPerson(record({ birthday: '02-29' }))).toMatchObject({
			birthdayMonth: '2',
			birthdayDay: '29'
		});
		expect(formFromPerson(record({ birthday: '' }))).toMatchObject({ birthdayMonth: '' });
		expect(formFromPerson(record({}))).toMatchObject({ birthdayMonth: '', birthdayDay: '' });
	});

	it("saves 'MM-DD', or '' when the month is “—”", () => {
		expect(fieldsFromForm({ ...valid(), birthdayMonth: '11', birthdayDay: '30' }).birthday).toBe(
			'11-30'
		);
		expect(fieldsFromForm({ ...valid(), birthdayMonth: '1', birthdayDay: '5' }).birthday).toBe(
			'01-05'
		);
		expect(fieldsFromForm(valid()).birthday).toBe('');
	});

	it('wants both or neither', () => {
		expect(validateForm({ ...valid(), birthdayMonth: '11', birthdayDay: '30' })).toEqual({});
		expect(validateForm({ ...valid(), birthdayMonth: '2', birthdayDay: '29' })).toEqual({});
		expect(validateForm({ ...valid(), birthdayMonth: '11' }).birthday).toBe(
			'Please choose the day too, or “—” as the month for no birthday.'
		);
		expect(validateForm({ ...valid(), birthdayDay: '3' }).birthday).toBe(
			'Please choose the month too.'
		);
		expect(validateForm({ ...valid(), birthdayMonth: '4', birthdayDay: '31' }).birthday).toBe(
			'April has only 30 days. Please choose another day.'
		);
		expect(validateForm({ ...valid(), birthdayMonth: '13', birthdayDay: '1' }).birthday).toBe(
			'Please choose the month from the list.'
		);
	});

	it('offers the days of the chosen month (February: up to 29), none without a month', () => {
		expect(birthdayDayChoices('')).toEqual([]);
		expect(birthdayDayChoices('2')).toHaveLength(29);
		expect(birthdayDayChoices('4').at(-1)).toBe(30);
		expect(birthdayDayChoices('12').at(-1)).toBe(31);
	});

	it('clears the day a new month has not got, and both with “—”', () => {
		const jan31 = { ...valid(), birthdayMonth: '1', birthdayDay: '31' };
		expect(withBirthdayMonth(jan31, '3')).toMatchObject({ birthdayMonth: '3', birthdayDay: '31' });
		expect(withBirthdayMonth(jan31, '4')).toMatchObject({ birthdayMonth: '4', birthdayDay: '' });
		expect(withBirthdayMonth({ ...jan31, birthdayDay: '29' }, '2')).toMatchObject({
			birthdayDay: '29'
		});
		expect(withBirthdayMonth(jan31, '')).toMatchObject({ birthdayMonth: '', birthdayDay: '' });
	});

	it('takes a day typed as digits: "22" is the 22nd, not the 20th', () => {
		const november = birthdayDayChoices('11');
		const type = (digits: string, days: readonly number[] = november) => {
			let typed = '';
			let day: number | undefined;
			for (const digit of digits) {
				const next = typedDay(typed, digit, days);
				typed = next.typed;
				if (next.day !== undefined) day = next.day;
			}
			return day;
		};
		expect(type('22')).toBe(22);
		expect(type('11')).toBe(11);
		expect(type('3')).toBe(3);
		expect(type('30')).toBe(30);
		expect(type('9')).toBe(9);
		// a leading zero waits for the next digit
		expect(type('05')).toBe(5);
		expect(type('0')).toBeUndefined();
		expect(typedDay('', '0', november)).toEqual({ typed: '0' });
		// a day the month hasn't got starts again with the last digit
		expect(type('31')).toBe(1);
		expect(type('301')).toBe(1);
		expect(type('45')).toBe(5);
		expect(type('31', birthdayDayChoices('12'))).toBe(31);
		expect(type('30', birthdayDayChoices('2'))).toBe(3);
		expect(type('29', birthdayDayChoices('2'))).toBe(29);
		// nothing to choose without a month
		expect(typedDay('', '2', [])).toEqual({ typed: '' });
		expect(DAY_TYPING_MS).toBe(1000);
	});

	it('is sent only when changed, and counts for "Discard your changes?"', () => {
		const person = record({ birthday: '11-30' });
		const before = fieldsFromForm(formFromPerson(person));
		const form = formFromPerson(person);
		expect(changedFields(before, fieldsFromForm(form))).toEqual({});
		expect(
			changedFields(before, fieldsFromForm({ ...form, birthdayMonth: '12', birthdayDay: '1' }))
		).toEqual({ birthday: '12-01' });
		expect(changedFields(before, fieldsFromForm(withBirthdayMonth(form, '')))).toEqual({
			birthday: ''
		});
		expect(sameForm(form, { ...form, birthdayDay: '29' })).toBe(false);
		expect(sameForm(form, formFromPerson(person))).toBe(true);
	});

	it('keeps a saved birthday that is not a real day unless one is chosen', () => {
		const person = record({ birthday: '04-31' });
		expect(unreadableBirthday(person)).toBe('04-31');
		expect(unreadableBirthday(record({ birthday: '04-30' }))).toBe('');
		expect(unreadableBirthday(record({}))).toBe('');
		expect(unreadableBirthday(null)).toBe('');
		const form = formFromPerson(person);
		expect(form).toMatchObject({ birthdayMonth: '', birthdayDay: '' });
		const before = fieldsFromForm(form);
		expect(changedFields(before, fieldsFromForm({ ...form, name: 'Dora M' }))).toEqual({
			name: 'Dora M'
		});
		expect(
			changedFields(before, fieldsFromForm({ ...form, birthdayMonth: '4', birthdayDay: '30' }))
		).toEqual({ birthday: '04-30' });
	});

	it("puts PocketBase's birthday error on the field", () => {
		expect(FORM_FIELD_OF.birthday).toBe('birthday');
	});
});

describe('changedFields', () => {
	it('keeps only what the form changed', () => {
		const person = record({ role: 'teacher', title: 'Ms.', active: true });
		const before = fieldsFromForm(formFromPerson(person));
		expect(changedFields(before, before)).toEqual({});

		const form = formFromPerson(person);
		form.name = 'Dora Marquez';
		form.start = '20';
		expect(changedFields(before, fieldsFromForm(form))).toEqual({
			name: 'Dora Marquez',
			video_start: 20
		});
	});

	it('leaves untouched switches alone, so a change made elsewhere survives', () => {
		const person = record({ active: true, is_guest: false });
		const before = fieldsFromForm(formFromPerson(person));
		const form = formFromPerson(person);
		form.pronoun = '';
		const changes = changedFields(before, fieldsFromForm(form));
		expect(changes).toEqual({ pronoun: '' });
		expect('active' in changes).toBe(false);
	});

	it('clears the times when the video is removed', () => {
		const person = record({ video_id: 'zenQCKkKEwc', video_start: 14, video_end: 30 });
		const form = { ...formFromPerson(person), video: '' };
		expect(changedFields(fieldsFromForm(formFromPerson(person)), fieldsFromForm(form))).toEqual({
			video_id: '',
			video_start: 0,
			video_end: 0
		});
	});

	it('clears the title when a teacher becomes a student', () => {
		const person = record({ role: 'teacher', title: 'Mr.' });
		const form = formFromPerson(person);
		form.role = 'student';
		expect(changedFields(fieldsFromForm(formFromPerson(person)), fieldsFromForm(form))).toEqual({
			role: 'student',
			title: ''
		});
	});
});
