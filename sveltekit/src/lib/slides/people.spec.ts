import { describe, it, expect } from 'vitest';
import type { GuestDaily, IconRecord, Person } from '#lib/pb/types.ts';
import {
	DEFAULT_AVATAR,
	applyPersonEvent,
	guestNameOptions,
	guestPeopleOf,
	guestPerson,
	guestPictureUrl,
	isPerson,
	studentsOf,
	teachersOf,
	visibleGuestDailies
} from './people.ts';

const person = (id: string, name: string, extra: Partial<Person> = {}): Person => ({
	id,
	collectionId: 'pbc_1795321340',
	collectionName: 'people',
	name,
	role: 'student',
	is_guest: false,
	active: true,
	...extra
});

const guest = (id: string, name: string, extra: Partial<GuestDaily> = {}): GuestDaily => ({
	id,
	collectionId: 'pbc_4221468678',
	collectionName: 'guest_dailies',
	date: '2026-11-20',
	here: '',
	name,
	avatar: '',
	...extra
});

const icon = (id: string, emoji: string): IconRecord => ({
	id,
	collectionId: 'pbc_icons',
	collectionName: 'icons',
	name: `Icon ${id}`,
	emoji,
	image: `${id}.png`,
	for_avatar: true,
	for_calendar: false
});

const ids = (people: { id: string }[]) => people.map((p) => p.id);

const amy = person('amy', 'Amy');
const ben = person('ben', 'Ben', { pronoun: 'he' });
const oldStudent = person('old', 'Olive', { active: false });
const guestStudent = person('gst', 'Gus', { is_guest: true });
const msLee = person('lee', 'Lee', { role: 'teacher', title: 'Ms.' });
const oldTeacher = person('olt', 'Otto', { role: 'teacher', active: false });
const grandma = person('gma', 'Grandma', { role: 'teacher', is_guest: true, avatar: 'gma.png' });
const oldGuest = person('ogu', 'Opal', { is_guest: true, active: false });
const everyone = [amy, ben, grandma, guestStudent, msLee, oldGuest, oldStudent, oldTeacher];

describe('who the attendance pages show', () => {
	it('lists active students who are not regular guests on the student page', () => {
		expect(ids(studentsOf(everyone))).toEqual(['amy', 'ben']);
	});

	it('lists active teachers who are not regular guests on the teacher page', () => {
		expect(ids(teachersOf(everyone))).toEqual(['lee']);
	});

	it('offers active regular guests (students or teachers) in the guest list', () => {
		expect(ids(guestPeopleOf(everyone))).toEqual(['gma', 'gst']);
	});

	it('treats a missing flag like PocketBase does (false)', () => {
		const legacy = { ...amy } as Partial<Person>;
		delete legacy.active;
		expect(studentsOf([legacy as Person])).toEqual([]);
	});

	it('tells people apart from guest check-ins', () => {
		expect(isPerson(amy)).toBe(true);
		expect(isPerson(guest('g1', 'Visitor'))).toBe(false);
	});
});

describe('guest check-ins', () => {
	const peopleById = new Map(everyone.map((p) => [p.id, p]));

	it('finds the person a check-in belongs to', () => {
		expect(guestPerson(guest('g1', 'Grandma', { person: 'gma' }), peopleById)).toBe(grandma);
		expect(guestPerson(guest('g2', 'Visitor'), peopleById)).toBeUndefined();
		expect(guestPerson(guest('g3', 'Gone', { person: 'deleted' }), peopleById)).toBeUndefined();
	});

	it('hides check-ins of people who are no longer active', () => {
		const dailies = [
			guest('g1', 'Visitor'),
			guest('g2', 'Grandma', { person: 'gma' }),
			guest('g3', 'Opal', { person: 'ogu' }),
			guest('g4', 'Gone', { person: 'deleted' })
		];
		expect(ids(visibleGuestDailies(dailies, peopleById))).toEqual(['g1', 'g2', 'g4']);
	});

	it("shows the person's own picture, else the icon, else the default avatar", () => {
		const star = icon('star', '⭐');
		expect(guestPictureUrl(grandma, star)).toMatch(/\/api\/files\/pbc_1795321340\/gma\/gma\.png$/);
		expect(guestPictureUrl(amy, star)).toMatch(/\/api\/files\/pbc_icons\/star\/star\.png$/);
		expect(guestPictureUrl(undefined, star)).toMatch(/\/api\/files\/pbc_icons\/star\/star\.png$/);
		expect(guestPictureUrl(amy, null)).toBe(DEFAULT_AVATAR);
		expect(guestPictureUrl(undefined, undefined)).toBe(DEFAULT_AVATAR);
	});
});

describe('guestNameOptions', () => {
	const peopleById = new Map(everyone.map((p) => [p.id, p]));
	const icons = new Map([['cat', icon('cat', '🐱')]]);

	it('lists regular guests first, then earlier one-off guests once each', () => {
		const previous = [
			guest('p1', 'Visitor', { avatar: 'cat' }),
			guest('p2', 'Visitor', { avatar: 'cat' }),
			guest('p3', 'Mystery', { avatar: 'nope' })
		];
		const options = guestNameOptions(guestPeopleOf(everyone), previous, peopleById, icons);
		expect(options.map(({ label, value, emoji }) => [label, value, emoji])).toEqual([
			['Grandma', 'person:gma', '👤'],
			['Gus', 'person:gst', '👤'],
			['Visitor', 'p1', '🐱'],
			['Mystery', 'p3', '❔']
		]);
		expect(options[0].person).toBe(grandma);
		expect(options[2].person).toBeUndefined();
	});

	it('does not list a one-off guest with the name of a regular guest', () => {
		const options = guestNameOptions([grandma], [guest('p1', 'Grandma')], peopleById, icons);
		expect(options.map((o) => o.value)).toEqual(['person:gma']);
	});

	it("leaves out a regular guest's earlier check-ins (the person is listed instead)", () => {
		const renamed = guest('p1', 'Granny', { person: 'gma' });
		const options = guestNameOptions([grandma], [renamed], peopleById, icons);
		expect(options.map((o) => o.value)).toEqual(['person:gma']);
	});

	it('leaves out check-ins of people who are no longer active', () => {
		const options = guestNameOptions(
			[],
			[guest('p1', 'Opal', { person: 'ogu' })],
			peopleById,
			icons
		);
		expect(options).toEqual([]);
	});

	it('keeps check-ins whose person was deleted as one-off guests', () => {
		const options = guestNameOptions(
			[],
			[guest('p1', 'Gone', { person: 'deleted' })],
			peopleById,
			icons
		);
		expect(options.map((o) => o.value)).toEqual(['p1']);
	});
});

describe('applyPersonEvent', () => {
	const list = [amy, ben, msLee];

	it('adds a new person in name order', () => {
		const bea = person('bea', 'Bea');
		expect(ids(applyPersonEvent(list, 'create', bea))).toEqual(['amy', 'bea', 'ben', 'lee']);
	});

	it('replaces an edited person and re-sorts on rename', () => {
		const renamed = { ...amy, name: 'Zoe' };
		const next = applyPersonEvent(list, 'update', renamed);
		expect(ids(next)).toEqual(['ben', 'lee', 'amy']);
		expect(next[2]).toBe(renamed);
	});

	it('keeps the other records as they are', () => {
		const next = applyPersonEvent(list, 'update', { ...ben, active: false });
		expect(next[0]).toBe(amy);
		expect(next[2]).toBe(msLee);
		expect(next[1].active).toBe(false);
	});

	it('adds a person it did not know yet on update', () => {
		expect(ids(applyPersonEvent(list, 'update', person('abe', 'Abe')))).toEqual([
			'abe',
			'amy',
			'ben',
			'lee'
		]);
	});

	it('removes a deleted person', () => {
		expect(ids(applyPersonEvent(list, 'delete', ben))).toEqual(['amy', 'lee']);
	});

	it('sorts like PocketBase (binary: capitals first) and keeps ties in order', () => {
		const lower = person('low', 'adam');
		const twin = person('twn', 'Amy');
		expect(ids(applyPersonEvent(list, 'create', lower))).toEqual(['amy', 'ben', 'lee', 'low']);
		expect(ids(applyPersonEvent(list, 'create', twin))).toEqual(['amy', 'twn', 'ben', 'lee']);
	});

	it('does not change the list it was given', () => {
		applyPersonEvent(list, 'create', person('bea', 'Bea'));
		expect(ids(list)).toEqual(['amy', 'ben', 'lee']);
	});
});
