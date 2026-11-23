import { describe, expect, it } from 'vitest';
import { changedFields } from '#lib/editor/form.ts';
import { builtInHolidays } from '#lib/pb/calendar.ts';
import type { CalendarObservance } from '#lib/pb/types.ts';
import {
	displayNameField,
	emptyForm,
	fieldsFromForm,
	formFieldOf,
	formFromRecord,
	imageChange,
	isBirthdayName,
	leavesAsItComes,
	MAX_DISPLAY_NAME,
	sameForm,
	savedFields,
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

	it('refuses to save while a picked day is not added', () => {
		const pendingDays = "You picked Wed, Dec 9, 2026 but didn't add it: press Add day.";
		const values = { ...emptyForm({}, holidays), name: 'Fair' };
		expect(valid(values, { pendingDays }).entries).toBe(pendingDays);
		values.entries = [{ kind: 'once', day: '2026-11-25' }];
		expect(valid(values, { pendingDays })).toEqual({ entries: pendingDays });
		expect(valid(values, { pendingDays: '' })).toEqual({});
		// Only your own days have a days list.
		const builtIn = { ...emptyForm({ holiday: 'Halloween' }, holidays) };
		expect(valid(builtIn, { pendingDays }).entries).toBeUndefined();
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
			display_name: '',
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

describe('leavesAsItComes: new changes to a holiday that change nothing are not saved', () => {
	const valentine = () => emptyForm({ kind: 'builtin', holiday: "Valentine's Day" }, holidays);

	it('is true for Customize left as it is, or with only its own name typed in', () => {
		expect(leavesAsItComes(valentine(), holidays)).toBe(true);
		for (const typed of ["Valentine's Day", 'Valentine’s Day', " Valentine's Day ", '   '])
			expect(leavesAsItComes({ ...valentine(), displayName: typed }, holidays), typed).toBe(true);
		// a holiday with no school: that is its own school day
		const thanksgiving = emptyForm({ holiday: 'Thanksgiving Day' }, holidays);
		expect(thanksgiving.school).toBe('none');
		expect(leavesAsItComes({ ...thanksgiving, displayName: 'Thanksgiving Day' }, holidays)).toBe(
			true
		);
		expect(leavesAsItComes({ ...thanksgiving, school: 'full' }, holidays)).toBe(false);
	});

	it('is true from "Add a day" too: a holiday chosen, nothing else changed', () => {
		const added = { ...emptyForm({}, holidays), kind: 'builtin' as const };
		expect(leavesAsItComes({ ...added, holiday: "Valentine's Day" }, holidays)).toBe(true);
		// days typed for your own day before switching don't count: a holiday has none
		added.entries = [{ kind: 'once', day: '2026-11-25' }];
		expect(leavesAsItComes({ ...added, holiday: "Valentine's Day" }, holidays)).toBe(true);
	});

	it('is false as soon as something changes', () => {
		const changes: Partial<ObservanceFormValues>[] = [
			{ displayName: 'Hearts Day' },
			{ school: 'none' },
			{ notes: 'Cards in the morning' },
			{ picture: 'icon', icon: 'icon00000000001' },
			{ hidden: true },
			{ active: false }
		];
		for (const change of changes)
			expect(leavesAsItComes({ ...valentine(), ...change }, holidays), JSON.stringify(change)).toBe(
				false
			);
	});

	it('is false for your own day (it has a name and days to save)', () => {
		const own = { ...emptyForm({}, holidays), name: 'Fun Run' };
		own.entries = [{ kind: 'once', day: '2026-11-25' }];
		expect(leavesAsItComes(own, holidays)).toBe(false);
		expect(leavesAsItComes(emptyForm({}, holidays), holidays)).toBe(false);
	});
});

describe('isBirthdayName: birthdays come from the People page', () => {
	it('spots a day named like a birthday, in any case', () => {
		for (const name of [
			"Bluey's Birthday",
			'Class birthdays',
			'BIRTHDAY PARTY',
			'Mr. Smith’s Birthday'
		])
			expect(isBirthdayName(name), name).toBe(true);
		for (const name of ['Minimum Day', 'Fun Run', 'Birth of a Nation Day', ''])
			expect(isBirthdayName(name), name).toBe(false);
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

describe("a built-in holiday's name on the calendar (display_name)", () => {
	const turkey = () => ({ ...emptyForm({ holiday: 'Thanksgiving Day' }, holidays) });

	it('starts empty, and reads the saved one (|| not ??: never set is "")', () => {
		expect(turkey().displayName).toBe('');
		const saved = record({ name: 'Thanksgiving Day', display_name: 'Turkey Day' });
		expect(formFromRecord(saved, holidays, TODAY).displayName).toBe('Turkey Day');
		const never = record({ name: 'Thanksgiving Day' });
		delete never.display_name;
		expect(formFromRecord(never, holidays, TODAY).displayName).toBe('');
		// your own day has no other name
		const own = record({ name: 'Fair', dates: ['11-19'], display_name: 'Odd' });
		expect(formFromRecord(own, holidays, TODAY).displayName).toBe('');
	});

	it("starts empty for one that is just the holiday's own name (typed in the dashboard)", () => {
		for (const [name, displayName] of [
			['Thanksgiving Day', 'Thanksgiving Day'],
			['Veterans Day', ' Veterans Day '],
			["Valentine's Day", 'Valentine’s Day']
		]) {
			const same = record({ name, display_name: displayName });
			expect(formFromRecord(same, holidays, TODAY).displayName).toBe('');
		}
		expect(
			formFromRecord(
				record({ name: 'Thanksgiving Day', display_name: ' Turkey Day ' }),
				holidays,
				TODAY
			).displayName
		).toBe('Turkey Day');
	});

	it('keeps the one held by a record the calendar ignores, for when it becomes a holiday', () => {
		const orphan = record({ name: 'Old Thing', display_name: ' Leftover ' });
		expect(formFromRecord(orphan, holidays, TODAY)).toMatchObject({
			kind: 'custom',
			displayName: 'Leftover'
		});
	});

	it("saves it trimmed, and '' when it is empty or the holiday's own name", () => {
		const values = turkey();
		expect(fieldsFromForm({ ...values, displayName: '  Turkey Day ' }, holidays).display_name).toBe(
			'Turkey Day'
		);
		expect(fieldsFromForm({ ...values, displayName: '   ' }, holidays).display_name).toBe('');
		expect(
			fieldsFromForm({ ...values, displayName: ' Thanksgiving Day ' }, holidays).display_name
		).toBe('');
		const valentine = emptyForm({ holiday: "Valentine's Day" }, holidays);
		expect(
			fieldsFromForm({ ...valentine, displayName: 'Valentine’s Day' }, holidays).display_name
		).toBe('');
		expect(displayNameField('Valentine’s Party', "Valentine's Day")).toBe('Valentine’s Party');
		// only built-in holidays have one
		const own = { ...emptyForm({}, holidays), name: 'Fair', displayName: 'Left over' };
		expect(fieldsFromForm(own, holidays).display_name).toBe('');
	});

	it('takes up to 100 characters (as PocketBase counts them)', () => {
		const values = turkey();
		expect(valid({ ...values, displayName: 'x'.repeat(100) })).toEqual({});
		expect(valid({ ...values, displayName: ` ${'x'.repeat(100)} ` })).toEqual({});
		expect(valid({ ...values, displayName: 'x'.repeat(101) }).displayName).toBe(
			'Please keep the name to 100 characters or fewer.'
		);
		// an emoji is one character to PocketBase, though two to JavaScript
		expect(valid({ ...values, displayName: '🦃'.repeat(100) })).toEqual({});
		expect(MAX_DISPLAY_NAME).toBe(100);
		// your own day's name has no such check here
		const own = { ...emptyForm({}, holidays), name: 'Fair', displayName: 'x'.repeat(101) };
		own.entries = [{ kind: 'once', day: '2026-11-25' }];
		expect(valid(own)).toEqual({});
	});

	it('is sent only when it changed, and counts as a change for "Discard your changes?"', () => {
		const saved = record({ name: 'Thanksgiving Day', display_name: 'Turkey Day', school: 'short' });
		const values = formFromRecord(saved, holidays, TODAY);
		const before = fieldsFromForm(values, holidays);
		expect(changedFields(before, fieldsFromForm({ ...values }, holidays))).toEqual({});
		expect(
			changedFields(before, fieldsFromForm({ ...values, displayName: 'Feast Day' }, holidays))
		).toEqual({ display_name: 'Feast Day' });
		expect(changedFields(before, fieldsFromForm({ ...values, displayName: '' }, holidays))).toEqual(
			{ display_name: '' }
		);
		expect(sameForm(values, { ...values, displayName: 'Turkey Day ' })).toBe(true);
		expect(sameForm(values, { ...values, displayName: 'Feast Day' })).toBe(false);
		// a name saved in the dashboard that is the holiday's own is left alone
		const same = formFromRecord(
			record({ name: 'Thanksgiving Day', display_name: 'Thanksgiving Day' }),
			holidays,
			TODAY
		);
		expect(changedFields(fieldsFromForm(same, holidays), fieldsFromForm(same, holidays))).toEqual(
			{}
		);
	});

	describe('savedFields: what is sent is compared with what the record really holds', () => {
		const changes = (
			saved: CalendarObservance,
			change: (values: ObservanceFormValues) => Partial<ObservanceFormValues>
		) => {
			const initial = formFromRecord(saved, holidays, TODAY);
			const values = { ...initial, ...change(initial) };
			return changedFields(
				savedFields(saved, initial, values, holidays),
				fieldsFromForm(values, holidays)
			);
		};

		it('sends a new name, an emptied one, and nothing when it is left alone', () => {
			const turkey = record({ name: 'Thanksgiving Day', display_name: 'Turkey Day' });
			expect(changes(turkey, () => ({}))).toEqual({});
			expect(changes(turkey, () => ({ displayName: 'Feast Day' }))).toEqual({
				display_name: 'Feast Day'
			});
			expect(changes(turkey, () => ({ displayName: '' }))).toEqual({ display_name: '' });
			expect(changes(turkey, () => ({ displayName: ' Thanksgiving Day ' }))).toEqual({
				display_name: ''
			});
		});

		it("sends nothing for a saved one that is just the holiday's own name", () => {
			for (const [name, displayName] of [
				['Veterans Day', 'Veterans Day'],
				["Valentine's Day", 'Valentine’s Day']
			]) {
				const same = record({ name, display_name: displayName });
				expect(changes(same, () => ({}))).toEqual({});
				expect(changes(same, () => ({ displayName: '' }))).toEqual({});
				expect(changes(same, () => ({ displayName: 'Hearts Day' }))).toEqual({
					display_name: 'Hearts Day'
				});
			}
		});

		it('clears a leftover one when a record the calendar ignores becomes a holiday', () => {
			const orphan = record({ name: 'Old Thing', display_name: 'Leftover' });
			const builtIn = { kind: 'builtin' as const, holiday: 'Thanksgiving Day' };
			// left as the form shows it: it stays
			expect(changes(orphan, () => builtIn)).toEqual({ name: 'Thanksgiving Day' });
			// emptied: the holiday shows under its own name, as the hint says
			expect(changes(orphan, () => ({ ...builtIn, displayName: '' }))).toEqual({
				name: 'Thanksgiving Day',
				display_name: ''
			});
			// a leftover that is that holiday's own name needs no change
			const same = record({ name: 'Old Thing', display_name: 'Thanksgiving Day' });
			expect(changes(same, () => builtIn)).toEqual({ name: 'Thanksgiving Day' });
		});

		it("leaves your own day's display_name alone (the calendar doesn't use it)", () => {
			const own = record({ name: 'Fair', dates: ['11-19'], display_name: 'Odd' });
			expect(changes(own, () => ({}))).toEqual({});
			expect(changes(own, () => ({ name: 'Fall Fair' }))).toEqual({ name: 'Fall Fair' });
			// a record the calendar ignores, given days of its own
			const orphan = record({ name: 'Old Thing', display_name: 'Leftover' });
			expect(changes(orphan, () => ({ entries: [{ kind: 'once', day: '2026-12-01' }] }))).toEqual({
				dates: ['2026-12-01']
			});
		});
	});

	it("puts PocketBase's display_name error on the field", () => {
		expect(formFieldOf('builtin').display_name).toBe('displayName');
	});
});
