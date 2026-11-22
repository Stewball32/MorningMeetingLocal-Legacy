import { describe, expect, it } from 'vitest';
import type { Person } from '#lib/pb/types.ts';
import { changedFields, emptyForm, fieldsFromForm, formFromPerson, validateForm } from './form.ts';

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
		expect(formFromPerson(record({ role: 'teacher', title: 'Ms.' }))).toEqual({
			name: 'Dora',
			role: 'teacher',
			title: 'Ms.',
			pronoun: 'she',
			video: 'zenQCKkKEwc',
			start: '14',
			end: '30',
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

	it('round-trips a record', () => {
		const person = record({ role: 'teacher', title: 'Ms.', is_guest: true, active: false });
		const fields = fieldsFromForm(formFromPerson(person));
		expect(fields).toEqual({
			name: person.name,
			role: person.role,
			title: person.title,
			pronoun: person.pronoun,
			video_id: person.video_id,
			video_start: person.video_start,
			video_end: person.video_end,
			is_guest: person.is_guest,
			active: person.active
		});
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
