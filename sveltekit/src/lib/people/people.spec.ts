import { describe, expect, it } from 'vitest';
import type { Person } from '#lib/pb/types.ts';
import {
	displayName,
	flagMessage,
	groupOf,
	groupPeople,
	historyParts,
	pronounLabel,
	roleLabel
} from './people.ts';

let nextId = 0;
const person = (fields: Partial<Person>): Person => ({
	id: `id${String(nextId++).padStart(13, '0')}`,
	collectionId: 'pbc_1795321340',
	collectionName: 'people',
	name: 'Someone',
	role: 'student',
	title: '',
	pronoun: '',
	is_guest: false,
	active: true,
	...fields
});

describe('displayName', () => {
	it('puts the title in front like the slides', () => {
		expect(displayName({ name: 'Smith', title: 'Mr.' })).toBe('Mr. Smith');
		expect(displayName({ name: 'Smith', title: '' })).toBe('Smith');
		expect(displayName({ name: 'Smith' })).toBe('Smith');
		expect(displayName({ name: 'Bluey', title: undefined })).toBe('Bluey');
	});
});

describe('groupOf / groupPeople', () => {
	const teacher = person({ name: 'Smith', role: 'teacher', title: 'Mr.' });
	const student = person({ name: 'Bluey' });
	const guestStudent = person({ name: 'Bingo', is_guest: true });
	const guestTeacher = person({ name: 'Grandma', role: 'teacher', is_guest: true });
	const inactiveStudent = person({ name: 'Old Kid', active: false });
	const inactiveGuest = person({ name: 'Old Guest', active: false, is_guest: true });
	const inactiveTeacher = person({ name: 'Retired', role: 'teacher', active: false });

	it('puts each person where the slides show them', () => {
		expect(groupOf(teacher)).toBe('teachers');
		expect(groupOf(student)).toBe('students');
		expect(groupOf(guestStudent)).toBe('guests');
		expect(groupOf(guestTeacher)).toBe('guests');
		expect(groupOf(inactiveStudent)).toBe('inactive');
		expect(groupOf(inactiveGuest)).toBe('inactive');
		expect(groupOf(inactiveTeacher)).toBe('inactive');
	});

	it('groups and sorts everyone, each person exactly once', () => {
		const everyone = [
			inactiveTeacher,
			student,
			guestTeacher,
			teacher,
			inactiveGuest,
			guestStudent,
			inactiveStudent
		];
		const groups = groupPeople(everyone);
		expect(groups.teachers).toEqual([teacher]);
		expect(groups.students).toEqual([student]);
		expect(groups.guests).toEqual([guestStudent, guestTeacher]);
		expect(groups.inactive).toEqual([inactiveGuest, inactiveStudent, inactiveTeacher]);
		const total = Object.values(groups).reduce((sum, list) => sum + list.length, 0);
		expect(total).toBe(everyone.length);
	});

	it('does not change the list it was given', () => {
		const list = [person({ name: 'B' }), person({ name: 'A' })];
		const copy = [...list];
		groupPeople(list);
		expect(list).toEqual(copy);
	});

	it('returns empty groups for nobody', () => {
		expect(groupPeople([])).toEqual({ teachers: [], students: [], guests: [], inactive: [] });
	});
});

describe('labels', () => {
	it('describes pronouns the way the slides use them', () => {
		expect(pronounLabel('he')).toBe('he / him');
		expect(pronounLabel('she')).toBe('she / her');
		expect(pronounLabel('')).toBe('they (not set)');
		expect(pronounLabel(undefined)).toBe('they (not set)');
	});

	it('names roles', () => {
		expect(roleLabel('teacher')).toBe('Teacher');
		expect(roleLabel('student')).toBe('Student');
	});
});

describe('historyParts', () => {
	it('names what is deleted with a person, leaving out what they have none of', () => {
		expect(historyParts({ days: 12, guestCheckIns: 3 })).toEqual([
			'12 days of attendance history',
			'3 guest check-ins'
		]);
		expect(historyParts({ days: 1, guestCheckIns: 0 })).toEqual(['1 day of attendance history']);
		expect(historyParts({ days: 0, guestCheckIns: 1 })).toEqual(['1 guest check-in']);
		expect(historyParts({ days: 0, guestCheckIns: 0 })).toEqual([]);
	});
});

describe('flagMessage', () => {
	const ms = (fields: Partial<Person>) =>
		person({ name: 'Smith', title: 'Ms.', role: 'teacher', ...fields });

	it('says where someone now shows up', () => {
		expect(flagMessage(ms({ is_guest: true }), 'is_guest')).toBe(
			'Ms. Smith is now a guest: only offered in the guest list.'
		);
		expect(flagMessage(ms({}), 'is_guest')).toBe(
			'Ms. Smith is no longer a guest and is back on the teacher attendance page.'
		);
		expect(flagMessage(ms({ active: false }), 'active')).toMatch(/now inactive/);
		expect(flagMessage(ms({}), 'active')).toMatch(/active again/);
	});

	it("doesn't promise the guest list for someone inactive", () => {
		const message = flagMessage(ms({ is_guest: true, active: false }), 'is_guest');
		expect(message).not.toMatch(/only offered in the guest list/);
		expect(message).toMatch(/inactive/);
		expect(flagMessage(ms({ active: false }), 'is_guest')).toBe('Ms. Smith is no longer a guest.');
	});
});
