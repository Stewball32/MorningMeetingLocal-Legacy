import { describe, expect, it } from 'vitest';
import { changedFields } from '#lib/editor/form.ts';
import { builtInHolidays } from '#lib/pb/calendar.ts';
import type { CalendarObservance } from '#lib/pb/types.ts';
import {
	emptyForm,
	fieldsFromForm,
	formFieldOf,
	formFromRecord,
	imageChange,
	sameForm,
	validateForm,
	type ObservanceFormValues
} from './form';

const TODAY = new Date(2026, 10, 22);
const holidays = builtInHolidays(2025, 10);

function record(fields: Partial<CalendarObservance>): CalendarObservance {
	return {
		id: 'rec000000000001',
		collectionId: 'pbc_326962381',
		collectionName: 'calendar_observances',
		created: '2026-01-01 00:00:00.000Z',
		updated: '',
		name: '',
		description: '',
		is_active: true,
		dates: [],
		image: '',
		icon: '',
		hidden: false,
		school: '',
		...fields
	} as CalendarObservance;
}

const valid = (values: ObservanceFormValues, extra = {}) =>
	validateForm(values, { holidays, hasUpload: false, ...extra });

describe('emptyForm', () => {
	it('adds your own day: shown, regular day, default picture', () => {
		expect(emptyForm({}, holidays)).toMatchObject({
			kind: 'custom',
			school: 'full',
			picture: 'default',
			active: true,
			hidden: false,
			entries: []
		});
	});

	it('starts a built-in holiday with its own school day (plain apostrophes)', () => {
		expect(emptyForm({ holiday: 'Veterans Day' }, holidays)).toMatchObject({
			kind: 'builtin',
			holiday: 'Veterans Day',
			school: 'none'
		});
		expect(emptyForm({ holiday: 'Valentine’s Day' }, holidays)).toMatchObject({
			holiday: "Valentine's Day",
			school: 'full'
		});
	});
});

describe('formFromRecord', () => {
	it("reads a built-in holiday settings record (school never set: the holiday's own)", () => {
		const values = formFromRecord(
			record({ name: 'Thanksgiving Day', image: 'turkey.png', description: 'Turkey' }),
			holidays,
			TODAY
		);
		expect(values).toMatchObject({
			kind: 'builtin',
			holiday: 'Thanksgiving Day',
			school: 'none',
			picture: 'upload',
			notes: 'Turkey'
		});
	});

	it('reads your own days and an icon', () => {
		const values = formFromRecord(
			record({ name: 'Fair', dates: ['11-19', '2026-11-25'], icon: 'icon00000000001' }),
			holidays,
			TODAY
		);
		expect(values).toMatchObject({ kind: 'custom', school: 'full', picture: 'icon' });
		expect(values.entries).toEqual([
			{ kind: 'once', day: '2026-11-25' },
			{ kind: 'yearly', day: '2027-11-19' }
		]);
	});

	it('reads a record the calendar ignores (no days, no such holiday) as your own', () => {
		expect(formFromRecord(record({ name: 'Teacher Day' }), holidays, TODAY).kind).toBe('custom');
	});
});

describe('validateForm', () => {
	it('needs a name and at least one day for your own day', () => {
		const errors = valid(emptyForm({}, holidays));
		expect(errors.name).toBe('Please enter a name.');
		expect(errors.entries).toBe('Please add at least one day.');
		const ok = { ...emptyForm({}, holidays), name: ' Fair ' };
		ok.entries = [{ kind: 'once', day: '2026-11-25' }];
		expect(valid(ok)).toEqual({});
	});

	it('needs a holiday, and refuses a second set of changes to one', () => {
		const values = emptyForm({ kind: 'builtin' }, holidays);
		expect(valid(values).holiday).toBe('Please choose the holiday to change.');
		values.holiday = 'Tax Day';
		expect(valid(values)).toEqual({});
		expect(valid(values, { takenBy: record({ name: 'Tax Day' }) }).holiday).toBe(
			"You've already changed Tax Day. Edit those changes instead."
		);
		values.holiday = 'Not a holiday';
		expect(valid(values).holiday).toBeDefined();
	});

	it('needs the chosen icon or picture', () => {
		const values = { ...emptyForm({ holiday: 'Tax Day' }, holidays), picture: 'icon' as const };
		expect(valid(values).icon).toMatch(/choose an icon/);
		expect(valid({ ...values, icon: 'icon00000000001' })).toEqual({});
		const upload = { ...values, picture: 'upload' as const };
		expect(valid(upload).image).toMatch(/choose a picture/);
		expect(valid(upload, { hasUpload: true })).toEqual({});
	});
});

describe('fieldsFromForm', () => {
	it('always sends a school day, is_active and hidden; dates as an array', () => {
		const values = { ...emptyForm({}, holidays), name: '  Fair ', notes: ' Gym ' };
		values.entries = [
			{ kind: 'yearly', day: '2027-11-19' },
			{ kind: 'once', day: '2026-11-25' }
		];
		expect(fieldsFromForm(values, holidays)).toEqual({
			name: 'Fair',
			dates: ['2026-11-25', '11-19'],
			school: 'full',
			description: 'Gym',
			is_active: true,
			hidden: false,
			icon: ''
		});
	});

	it('saves a built-in holiday with no dates, under its plain name', () => {
		const values = { ...emptyForm({ holiday: 'Valentine’s Day' }, holidays), hidden: true };
		values.entries = [{ kind: 'once', day: '2026-11-25' }];
		expect(fieldsFromForm(values, holidays)).toMatchObject({
			name: "Valentine's Day",
			dates: [],
			hidden: true,
			school: 'full'
		});
	});

	it('keeps the icon only when the icon is the picture', () => {
		const values = { ...emptyForm({ holiday: 'Tax Day' }, holidays), icon: 'icon00000000001' };
		expect(fieldsFromForm({ ...values, picture: 'icon' }, holidays).icon).toBe('icon00000000001');
		expect(fieldsFromForm({ ...values, picture: 'upload' }, holidays).icon).toBe('');
	});

	it('sends nothing for an unchanged record, even one saved unsorted or with a school never set', () => {
		const saved = record({ name: 'Fair', dates: ['11-19', '2026-11-25'] });
		const values = formFromRecord(saved, holidays, TODAY);
		const before = fieldsFromForm(values, holidays);
		expect(changedFields(before, fieldsFromForm({ ...values }, holidays))).toEqual({});
		expect(changedFields(before, fieldsFromForm({ ...values, school: 'short' }, holidays))).toEqual(
			{ school: 'short' }
		);
	});
});

describe('imageChange', () => {
	it('uploads, removes or leaves its own picture', () => {
		const file = new File(['x'], 'x.png', { type: 'image/png' });
		expect(imageChange('upload', file, true)).toBe(file);
		expect(imageChange('upload', undefined, true)).toBeUndefined();
		expect(imageChange('icon', undefined, true)).toBeNull(); // it would win over the icon
		expect(imageChange('default', undefined, false)).toBeUndefined();
	});
});

describe('sameForm', () => {
	it('compares days by what is saved and text without the spaces around it', () => {
		const a = { ...emptyForm({}, holidays), name: 'Fair' };
		a.entries = [{ kind: 'once', day: '2026-11-25' }];
		const b = { ...a, name: 'Fair ', entries: [{ kind: 'once' as const, day: '2026-11-25' }] };
		expect(sameForm(a, b)).toBe(true);
		expect(sameForm(a, { ...b, entries: [] })).toBe(false);
		expect(sameForm(a, { ...b, school: 'none' })).toBe(false);
	});
});

describe('formFieldOf', () => {
	it("puts PocketBase's name error on the holiday picker for a built-in holiday", () => {
		expect(formFieldOf('builtin').name).toBe('holiday');
		expect(formFieldOf('custom').name).toBe('name');
		expect(formFieldOf('custom').dates).toBe('entries');
	});
});
