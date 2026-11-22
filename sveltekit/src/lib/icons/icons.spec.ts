import { describe, expect, it } from 'vitest';
import { ClientResponseError } from 'pocketbase';
import type { IconRecord } from '#lib/pb/types.ts';
import {
	afterDelete,
	groupIcons,
	iconLabel,
	isDeleteClash,
	joinWords,
	needsPicture,
	switchMessage,
	totalUses,
	turnedOffMessage,
	usageParts
} from './icons.ts';
import { allOff, USES, useOf, usesOf } from './uses.ts';

let next = 0;
function icon(fields: Partial<IconRecord> = {}): IconRecord {
	next++;
	return {
		id: `icon${String(next).padStart(11, '0')}`,
		collectionId: 'pbc_423132189',
		collectionName: 'icons',
		name: `Icon ${next}`,
		emoji: '🚀',
		image: 'rocket.png',
		for_guests: false,
		for_calendar: false,
		...fields
	} as IconRecord;
}

describe('USES', () => {
	it('has one entry per switch field, with what to count', () => {
		expect(USES.map((use) => [use.key, use.field, use.label])).toEqual([
			['guests', 'for_guests', 'Guests'],
			['calendar', 'for_calendar', 'Calendar']
		]);
		expect(USES.map((use) => `${use.usedBy.collection}.${use.usedBy.field}`)).toEqual([
			'guest_dailies.avatar',
			'calendar_observances.icon'
		]);
		expect(new Set(USES.map((use) => use.key)).size).toBe(USES.length);
	});

	it('finds the uses an icon is on for, and turns them all off', () => {
		const both = icon({ for_guests: true, for_calendar: true });
		expect(usesOf(both).map((use) => use.key)).toEqual(['guests', 'calendar']);
		expect(usesOf(icon()).map((use) => use.key)).toEqual([]);
		expect(allOff(both)).toEqual({ for_guests: false, for_calendar: false });
		// Only what is on is sent.
		expect(allOff(icon({ for_calendar: true }))).toEqual({ for_calendar: false });
		expect(allOff(icon())).toEqual({});
		expect(useOf('for_calendar').label).toBe('Calendar');
	});
});

describe('groupIcons', () => {
	it('puts each icon in the group of every use it is on for, or in "unused"', () => {
		const guest = icon({ name: 'Rocket', for_guests: true });
		const both = icon({ name: 'Apple', for_guests: true, for_calendar: true });
		const calendar = icon({ name: 'Calendar', for_calendar: true });
		const unused = icon({ name: 'Old' });
		const groups = groupIcons([guest, both, calendar, unused]);
		expect(groups.guests).toEqual([both, guest]);
		expect(groups.calendar).toEqual([both, calendar]);
		expect(groups.unused).toEqual([unused]);
	});

	it('sorts like PocketBase (binary: capitals first), then by id', () => {
		const a = icon({ name: 'apple', for_guests: true });
		const z = icon({ name: 'Zebra', for_guests: true });
		const twin1 = icon({ name: 'Sun', for_guests: true });
		const twin2 = icon({ name: 'Sun', for_guests: true, emoji: '🌞' });
		expect(groupIcons([a, twin2, z, twin1]).guests).toEqual([twin1, twin2, z, a]);
	});

	it('gives empty groups for no icons', () => {
		expect(groupIcons([])).toEqual({ guests: [], calendar: [], unused: [] });
	});
});

describe('words', () => {
	it('names an icon with its emoji', () => {
		expect(iconLabel({ name: 'Rocket', emoji: '🚀' })).toBe('Rocket 🚀');
		expect(iconLabel({ name: 'Rocket', emoji: '' })).toBe('Rocket');
	});

	it('joins words', () => {
		expect(joinWords([])).toBe('');
		expect(joinWords(['a'])).toBe('a');
		expect(joinWords(['a', 'b'])).toBe('a and b');
		expect(joinWords(['a', 'b', 'c'], 'or')).toBe('a, b or c');
	});

	it('counts uses, leaving out what nothing uses', () => {
		expect(usageParts({ guests: 12, calendar: 1 })).toEqual([
			'12 guest check-ins',
			'1 calendar observance'
		]);
		expect(usageParts({ guests: 0, calendar: 2 })).toEqual(['2 calendar observances']);
		expect(usageParts({ guests: 0, calendar: 0 })).toEqual([]);
		expect(totalUses({ guests: 12, calendar: 1 })).toBe(13);
	});

	it('says what deleting does, only for what is used (all of it when unknown)', () => {
		expect(afterDelete({ guests: 3, calendar: 0 })).toEqual([
			'past guest check-ins that used it show the default picture instead'
		]);
		expect(afterDelete(null)).toHaveLength(USES.length);
		expect(afterDelete({ guests: 0, calendar: 0 })).toEqual([]);
	});

	it('words a switch change', () => {
		const rocket = icon({ name: 'Rocket', for_guests: true });
		expect(switchMessage(rocket, 'for_guests')).toBe(
			'Rocket is now offered to guests when they check in.'
		);
		expect(switchMessage({ ...rocket, for_guests: false }, 'for_guests')).toBe(
			'Rocket is no longer offered to guests. Past check-ins keep its picture.'
		);
		expect(switchMessage({ ...rocket, for_calendar: true }, 'for_calendar')).toMatch(
			/can now be picked for calendar observances/
		);
	});

	it('words "Turn off instead"', () => {
		expect(turnedOffMessage('Rocket', ['for_guests', 'for_calendar'])).toBe(
			'Turned off Rocket: no longer offered for guests or for the calendar. Everything that used it keeps its picture.'
		);
		expect(turnedOffMessage('Rocket', ['for_calendar'])).toMatch(
			/no longer offered for the calendar\./
		);
		expect(turnedOffMessage('Rocket', [])).toBe('Rocket was already turned off.');
	});
});

describe('needsPicture', () => {
	it('is true only for a guest icon without a picture', () => {
		expect(needsPicture({ for_guests: true, image: '' })).toBe(true);
		expect(needsPicture({ for_guests: true, image: 'a.png' })).toBe(false);
		expect(needsPicture({ for_guests: false, image: '' })).toBe(false);
	});
});

describe('isDeleteClash', () => {
	it('spots the old guest_dailies index refusing a delete', () => {
		// What PocketBase answered before the migration made that index partial.
		const clash = new ClientResponseError({
			status: 400,
			response: {
				message:
					'Failed to delete record. Make sure that the record is not part of a required relation reference.',
				data: Object.fromEntries(
					['avatar', 'date', 'name', 'person'].map((key) => [
						key,
						{ code: 'validation_not_unique', message: 'Value must be unique.' }
					])
				)
			}
		});
		expect(isDeleteClash(clash)).toBe(true);
		expect(isDeleteClash(new ClientResponseError({ status: 404 }))).toBe(false);
		expect(isDeleteClash(new Error('x'))).toBe(false);
	});
});
