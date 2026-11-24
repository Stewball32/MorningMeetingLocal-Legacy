import { describe, it, expect } from 'vitest';
import { ClientResponseError } from 'pocketbase';
import type { GuestDaily, IconRecord, Person } from '#lib/pb/types.ts';
import {
	DEFAULT_AVATAR,
	applyPersonEvent,
	checkedInPeople,
	guestCheckInError,
	guestDisplayName,
	guestIconOptions,
	guestNameOptions,
	isGuestIcon,
	guestPeopleOf,
	guestPerson,
	guestPictureUrl,
	isPerson,
	lastIconOf,
	regularGuestProblem,
	SMALL_PICTURE,
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

const icon = (id: string, extra: Partial<IconRecord> = {}) =>
	({
		id,
		collectionId: 'pbc_icons',
		collectionName: 'icons',
		name: `Icon ${id}`,
		image: `${id}.png`,
		for_guests: true,
		for_calendar: false,
		...extra
	}) as IconRecord;

/** The small copy's URL of a picture stored on a record. */
const small = (collectionId: string, id: string, file: string) =>
	`http://pocketbase.invalid/api/files/${collectionId}/${id}/${file}?thumb=100x100`;

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

	it('hides check-ins of people switched to Guest off (they count as a student or teacher now)', () => {
		const dailies = [
			guest('g1', 'Gus', { person: 'gst' }),
			guest('g2', 'Amy', { person: 'amy' }),
			guest('g3', 'Ms. Lee', { person: 'lee' })
		];
		expect(ids(visibleGuestDailies(dailies, peopleById))).toEqual(['g1']);
		const gusNoLongerAGuest = new Map(peopleById).set('gst', { ...guestStudent, is_guest: false });
		expect(visibleGuestDailies(dailies, gusNoLongerAGuest)).toEqual([]);
	});

	it("shows a regular guest's current name and title, else the name saved at check-in", () => {
		const officer = person('ofc', 'Dan', { role: 'teacher', title: 'Officer', is_guest: true });
		const checkIn = guest('g1', 'Dan', { person: 'ofc' });
		expect(guestDisplayName(checkIn, officer)).toBe('Officer Dan');
		expect(guestDisplayName(checkIn, { ...officer, name: 'Daniel' })).toBe('Officer Daniel');
		expect(guestDisplayName(checkIn, { ...officer, title: '' })).toBe('Dan');
		expect(guestDisplayName(guest('g2', 'Officer Dan', { person: 'gone' }), undefined)).toBe(
			'Officer Dan'
		);
		expect(guestDisplayName(guest('g3', 'Visitor'), undefined)).toBe('Visitor');
	});

	it('lists the people among the check-ins', () => {
		const dailies = [
			guest('g1', 'Visitor'),
			guest('g2', 'Grandma', { person: 'gma' }),
			guest('g3', 'Old', { person: '' })
		];
		expect([...checkedInPeople(dailies)]).toEqual(['gma']);
	});

	it("shows the person's own picture, else the icon, else the default avatar", () => {
		const star = icon('star');
		expect(guestPictureUrl(grandma, star)).toMatch(/\/api\/files\/pbc_1795321340\/gma\/gma\.png$/);
		expect(guestPictureUrl(amy, star)).toMatch(/\/api\/files\/pbc_icons\/star\/star\.png$/);
		expect(guestPictureUrl(undefined, star)).toMatch(/\/api\/files\/pbc_icons\/star\/star\.png$/);
		expect(guestPictureUrl(amy, null)).toBe(DEFAULT_AVATAR);
		expect(guestPictureUrl(undefined, undefined)).toBe(DEFAULT_AVATAR);
	});

	it('shows the default avatar for an icon without a picture', () => {
		const old = icon('old', { image: '' });
		expect(guestPictureUrl(undefined, old)).toBe(DEFAULT_AVATAR);
		expect(guestPictureUrl(amy, old, SMALL_PICTURE)).toBe(DEFAULT_AVATAR);
		expect(guestPictureUrl(grandma, old, SMALL_PICTURE)).toBe(
			small('pbc_1795321340', 'gma', 'gma.png')
		);
	});

	it('asks PocketBase for a small copy when told to', () => {
		const star = icon('star');
		expect(guestPictureUrl(undefined, star, SMALL_PICTURE)).toBe(
			small('pbc_icons', 'star', 'star.png')
		);
		expect(guestPictureUrl(grandma, star, SMALL_PICTURE)).toBe(
			small('pbc_1795321340', 'gma', 'gma.png')
		);
		expect(guestPictureUrl(undefined, null, SMALL_PICTURE)).toBe(DEFAULT_AVATAR);
	});
});

describe('lastIconOf', () => {
	const icons = new Map(['cat', 'dog', 'owl'].map((id) => [id, icon(id)]));

	it("finds the icon of a person's latest check-in that has one", () => {
		const previous = [
			guest('p1', 'Gus', { person: 'gst', avatar: 'cat', date: '2026-10-01' }),
			guest('p2', 'Gus', { person: 'gst', avatar: 'dog', date: '2026-11-02' }),
			guest('p3', 'Gus', { person: 'gst', avatar: 'owl', date: '2026-10-15' }),
			guest('p4', 'Visitor', { avatar: 'owl', date: '2026-11-19' })
		];
		expect(lastIconOf('gst', previous, icons)?.id).toBe('dog');
		expect(lastIconOf('gma', previous, icons)).toBeUndefined();
	});

	it('takes the one saved last on the same day', () => {
		const previous = [
			guest('p1', 'Gus', { person: 'gst', avatar: 'cat', created: '2026-11-02 09:00:00.000Z' }),
			guest('p2', 'Gus', { person: 'gst', avatar: 'dog', created: '2026-11-02 08:00:00.000Z' })
		];
		expect(lastIconOf('gst', previous, icons)?.id).toBe('cat');
	});

	it('skips check-ins without an icon, or whose icon is gone', () => {
		const previous = [
			guest('p1', 'Gus', { person: 'gst', avatar: 'cat', date: '2026-10-01' }),
			guest('p2', 'Gus', { person: 'gst', avatar: '', date: '2026-11-02' }),
			guest('p3', 'Gus', { person: 'gst', avatar: 'deleted', date: '2026-11-03' })
		];
		expect(lastIconOf('gst', previous, icons)?.id).toBe('cat');
		expect(lastIconOf('gst', previous.slice(1), icons)).toBeUndefined();
	});
});

describe('guestNameOptions', () => {
	const peopleById = new Map(everyone.map((p) => [p.id, p]));
	const icons = new Map([['cat', icon('cat')]]);

	it('lists regular guests first, then earlier one-off guests once each', () => {
		const previous = [
			guest('p1', 'Visitor', { avatar: 'cat' }),
			guest('p2', 'Visitor', { avatar: 'cat' }),
			guest('p3', 'Mystery', { avatar: 'nope' })
		];
		const options = guestNameOptions(guestPeopleOf(everyone), previous, peopleById, icons);
		expect(options.map(({ label, value }) => [label, value])).toEqual([
			['Grandma', 'person:gma'],
			['Gus', 'person:gst'],
			['Visitor', 'p1'],
			['Mystery', 'p3']
		]);
		expect(options[0].person).toBe(grandma);
		expect(options[2].person).toBeUndefined();
	});

	it("shows a regular guest's own picture, else their latest check-in's icon, else the default", () => {
		const dog = icon('dog');
		const withDog = new Map([...icons, ['dog', dog]]);
		const previous = [
			guest('p1', 'Grandma', { person: 'gma', avatar: 'cat', date: '2026-11-02' }),
			guest('p2', 'Gus', { person: 'gst', avatar: 'cat', date: '2026-10-01' }),
			guest('p3', 'Gus', { person: 'gst', avatar: 'dog', date: '2026-11-02' })
		];
		const pictures = (list: GuestDaily[], map = withDog) =>
			guestNameOptions(guestPeopleOf(everyone), list, peopleById, map).map((o) => [
				o.label,
				o.picture
			]);
		expect(pictures(previous)).toEqual([
			['Grandma', small('pbc_1795321340', 'gma', 'gma.png')],
			['Gus', small('pbc_icons', 'dog', 'dog.png')]
		]);
		// the icon was deleted on the Icons page: the one before it
		expect(pictures(previous, icons)).toEqual([
			['Grandma', small('pbc_1795321340', 'gma', 'gma.png')],
			['Gus', small('pbc_icons', 'cat', 'cat.png')]
		]);
		// never checked in, or its icon has no picture: the default avatar
		expect(pictures([])[1]).toEqual(['Gus', DEFAULT_AVATAR]);
		const noPicture = new Map([['dog', icon('dog', { image: '' })]]);
		expect(pictures([previous[2]], noPicture)[1]).toEqual(['Gus', DEFAULT_AVATAR]);
	});

	it("shows a one-off guest's icon from the check-in it reuses, else the default", () => {
		const previous = [
			guest('p1', 'Visitor', { avatar: 'cat' }),
			guest('p2', 'Visitor', { avatar: 'dog' }),
			guest('p3', 'Mystery', { avatar: 'nope' }),
			guest('p4', 'Nobody'),
			guest('p5', 'Gone', { person: 'deleted', avatar: 'cat' })
		];
		const options = guestNameOptions([], previous, peopleById, icons);
		expect(options.map((o) => [o.value, o.picture])).toEqual([
			['p1', small('pbc_icons', 'cat', 'cat.png')],
			['p3', DEFAULT_AVATAR],
			['p4', DEFAULT_AVATAR],
			['p5', small('pbc_icons', 'cat', 'cat.png')]
		]);
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

	it('labels regular guests with their display name (title + name)', () => {
		const officer = person('ofc', 'Dan', { role: 'teacher', title: 'Officer', is_guest: true });
		const options = guestNameOptions(
			[officer],
			[guest('p1', 'Officer Dan', { avatar: 'cat' }), guest('p2', 'Dan', { avatar: 'cat' })],
			peopleById,
			icons
		);
		expect(options.map((o) => [o.label, o.value])).toEqual([
			['Officer Dan', 'person:ofc'],
			['Dan', 'p2']
		]);
	});

	it('leaves out regular guests already checked in today, and their names as one-off guests', () => {
		const previous = [
			guest('p1', 'Grandma', { avatar: 'cat' }),
			guest('p2', 'Granny', { person: 'gma' }),
			guest('p3', 'Visitor', { avatar: 'cat' })
		];
		const options = guestNameOptions(
			guestPeopleOf(everyone),
			previous,
			peopleById,
			icons,
			new Set(['gma'])
		);
		expect(options.map((o) => o.value)).toEqual(['person:gst', 'p3']);
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

describe('checking in a regular guest', () => {
	const officer = person('ofc', 'Dan', { role: 'teacher', title: 'Officer', is_guest: true });

	it('is fine while they are an active regular guest not checked in yet', () => {
		expect(regularGuestProblem(officer, officer, new Set())).toBeUndefined();
		expect(regularGuestProblem(officer, { ...officer, name: 'Daniel' }, new Set())).toBeUndefined();
	});

	it('says why not when the People page changed them since they were picked', () => {
		expect(regularGuestProblem(officer, undefined, new Set())).toBe(
			"Officer Dan was deleted on the People page, so they can't be checked in."
		);
		expect(regularGuestProblem(officer, { ...officer, active: false }, new Set())).toBe(
			"Officer Dan is switched off (not Active) on the People page, so they can't be checked in."
		);
		expect(regularGuestProblem(officer, { ...officer, is_guest: false }, new Set())).toBe(
			"Officer Dan is no longer a guest (Guest is off on the People page), so they can't be checked in as one."
		);
		expect(regularGuestProblem(officer, { ...officer, name: 'Daniel' }, new Set(['ofc']))).toBe(
			'Officer Daniel is already checked in today.'
		);
	});
});

describe('guestCheckInError', () => {
	// what the SDK throws for a 400 (see ClientResponseError's constructor)
	const pbError = (data: Record<string, { code: string; message: string }>) =>
		new ClientResponseError({
			url: 'http://pb/api/collections/guest_dailies/records',
			status: 400,
			data: { data, message: 'Failed to create record.', status: 400 }
		});
	// createGuestDaily wraps the SDK error
	const wrapped = (cause: unknown) => new Error(`Error creating guest daily: ${cause}`, { cause });
	const notUnique = { code: 'validation_not_unique', message: 'Value must be unique.' };

	it('reports a unique clash as already checked in (regular or one-off guest)', () => {
		const twice = pbError({ date: notUnique, person: notUnique });
		expect(guestCheckInError('Officer Dan', wrapped(twice))).toBe(
			'Officer Dan is already checked in today.'
		);
		expect(guestCheckInError('Officer Dan', twice)).toBe(
			'Officer Dan is already checked in today.'
		);
		const sameOneOff = pbError({
			avatar: notUnique,
			date: notUnique,
			name: notUnique,
			person: notUnique
		});
		expect(guestCheckInError('Visitor', wrapped(sameOneOff))).toBe(
			'Visitor is already checked in today.'
		);
	});

	it('reports a person deleted meanwhile', () => {
		const gone = pbError({
			person: {
				code: 'validation_missing_rel_records',
				message: 'Failed to find all relation records with the provided ids.'
			}
		});
		expect(guestCheckInError('Grandma', wrapped(gone))).toBe(
			"Grandma was deleted on the People page, so they can't be checked in."
		);
	});

	it('reports an icon deleted meanwhile', () => {
		const iconGone = pbError({
			avatar: {
				code: 'validation_missing_rel_records',
				message: 'Failed to find all relation records with the provided ids.'
			}
		});
		expect(guestCheckInError('Visitor', wrapped(iconGone))).toBe(
			'The icon picked for Visitor was just deleted on the Icons page. Please pick another one.'
		);
	});

	it('says it could not add them otherwise', () => {
		const offline = new ClientResponseError({ url: 'x', status: 0, isAbort: false });
		expect(guestCheckInError('Visitor', wrapped(offline))).toBe(
			"Couldn't add Visitor. Please try again."
		);
		expect(guestCheckInError('Visitor', new Error('boom'))).toBe(
			"Couldn't add Visitor. Please try again."
		);
		expect(guestCheckInError('Visitor', undefined)).toBe("Couldn't add Visitor. Please try again.");
	});
});

describe('guestIconOptions', () => {
	const named = (id: string, name: string, forGuests: boolean) =>
		({ ...icon(id), name, for_guests: forGuests }) as IconRecord;

	it('offers only the icons for guests, by name, from the live map', () => {
		const icons = new Map(
			[
				named('z', 'Zebra', true),
				named('c', 'Calendar only', false),
				named('a', 'Ant', true),
				named('b', 'bee', true) // lowercase sorts after uppercase, like PocketBase
			].map((i) => [i.id, i])
		);
		expect(guestIconOptions(icons).map((option) => option.label)).toEqual(['Ant', 'Zebra', 'bee']);
		expect(guestIconOptions(icons)[0]).toEqual({
			label: 'Ant',
			value: 'a',
			picture: small('pbc_icons', 'a', 'a.png')
		});
	});

	it("shows each icon's small picture, or the default avatar when it has none", () => {
		const icons = new Map(
			[named('a', 'Ant', true), { ...named('o', 'Old', true), image: '' }].map((i) => [i.id, i])
		);
		expect(guestIconOptions(icons).map((option) => option.picture)).toEqual([
			small('pbc_icons', 'a', 'a.png'),
			DEFAULT_AVATAR
		]);
	});

	it('follows icons switched off for guests or deleted', () => {
		const icons = new Map(
			[named('a', 'Ant', true), named('z', 'Zebra', true)].map((i) => [i.id, i])
		);
		icons.set('a', named('a', 'Ant', false));
		icons.delete('z');
		expect(guestIconOptions(icons)).toEqual([]);
		expect(isGuestIcon(named('x', 'X', true))).toBe(true);
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
