import { describe, expect, it } from 'vitest';
import { changedFields, hasErrors, sameValues } from './form.ts';

describe('sameValues', () => {
	it('ignores spaces around text', () => {
		expect(sameValues({ name: 'Sun', on: true }, { name: ' Sun ', on: true })).toBe(true);
		expect(sameValues({ name: 'Sun', on: true }, { name: 'Sun!', on: true })).toBe(false);
	});

	it('compares other values exactly', () => {
		expect(sameValues({ name: 'Sun', on: true }, { name: 'Sun', on: false })).toBe(false);
		const dates = ['2026-11-26'];
		expect(sameValues({ dates }, { dates })).toBe(true);
		// Arrays and objects are compared by identity: build them once per form.
		expect(sameValues({ dates }, { dates: [...dates] })).toBe(false);
	});
});

describe('changedFields', () => {
	it('keeps only what changed', () => {
		const before = { name: 'Sun', emoji: '☀️', for_guests: true, for_calendar: false };
		expect(changedFields(before, { ...before, name: 'Sunny', for_calendar: true })).toEqual({
			name: 'Sunny',
			for_calendar: true
		});
	});

	it('is empty when nothing changed (then nothing is sent)', () => {
		const fields = { name: 'Sun', for_guests: true };
		expect(changedFields(fields, { ...fields })).toEqual({});
	});

	it('keeps a change to an empty value', () => {
		expect(changedFields({ name: 'Sun', notes: 'x' }, { name: 'Sun', notes: '' })).toEqual({
			notes: ''
		});
	});

	it('compares lists item by item (e.g. dates built anew by the form)', () => {
		const before = { name: 'Fair', dates: ['2026-11-25', '11-19'] };
		expect(changedFields(before, { name: 'Fair', dates: ['2026-11-25', '11-19'] })).toEqual({});
		expect(changedFields(before, { name: 'Fair', dates: ['11-19', '2026-11-25'] })).toEqual({
			dates: ['11-19', '2026-11-25']
		});
		expect(changedFields(before, { name: 'Fair', dates: [] })).toEqual({ dates: [] });
	});
});

describe('hasErrors', () => {
	it('spots any message', () => {
		expect(hasErrors({})).toBe(false);
		expect(hasErrors({ name: undefined })).toBe(false);
		expect(hasErrors({ name: undefined, emoji: 'Pick one emoji.' })).toBe(true);
	});
});
