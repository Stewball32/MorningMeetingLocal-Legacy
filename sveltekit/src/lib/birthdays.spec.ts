import { describe, expect, it } from 'vitest';
import { PUBLIC_POCKETBASE_URL } from '$app/env/public';
import {
	BIRTHDAY_PICTURE,
	birthdayInYear,
	birthdayName,
	birthdayPicture,
	birthdaysForMonth,
	birthdayValue,
	daysInBirthdayMonth,
	daysUntil,
	daysUntilText,
	formatBirthday,
	nextBirthday,
	parseBirthday,
	showsBirthday,
	upcomingBirthdays,
	type BirthdayPerson
} from './birthdays.ts';

let made = 0;
/** A person as getBirthdayPeople returns them (active, a student with no picture). */
function person(fields: Partial<BirthdayPerson>): BirthdayPerson {
	made++;
	return {
		id: `per${String(made).padStart(12, '0')}`,
		collectionId: 'pbc_1795321340',
		name: 'Bluey',
		title: '',
		avatar: '',
		active: true,
		birthday: '',
		...fields
	};
}

const ymd = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()];

describe('parseBirthday and birthdayValue', () => {
	it("reads 'MM-DD', Feb 29 included", () => {
		expect(parseBirthday('11-30')).toEqual({ month: 11, day: 30 });
		expect(parseBirthday('02-29')).toEqual({ month: 2, day: 29 });
		expect(parseBirthday(' 01-05 ')).toEqual({ month: 1, day: 5 });
	});

	it('gives null for none, and for a day that does not exist', () => {
		for (const value of ['', null, undefined, 42, '1-5', '2026-11-30', '13-01', '00-10', '11-00'])
			expect(parseBirthday(value), String(value)).toBeNull();
		// the field's pattern lets these through (typed in the dashboard)
		expect(parseBirthday('04-31')).toBeNull();
		expect(parseBirthday('02-30')).toBeNull();
	});

	it("saves 'MM-DD', or '' for a day that does not exist", () => {
		expect(birthdayValue(11, 30)).toBe('11-30');
		expect(birthdayValue(2, 29)).toBe('02-29');
		expect(birthdayValue(1, 5)).toBe('01-05');
		expect(birthdayValue(4, 31)).toBe('');
		expect(birthdayValue(0, 5)).toBe('');
		expect(birthdayValue(5, 0)).toBe('');
	});

	it('offers 29 days in February and the real length of the other months', () => {
		expect(Array.from({ length: 12 }, (_, index) => daysInBirthdayMonth(index + 1))).toEqual([
			31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31
		]);
	});
});

describe('birthdayInYear and nextBirthday', () => {
	it('puts Feb 29 on Feb 28 in a year without one', () => {
		const leap = { month: 2, day: 29 };
		expect(ymd(birthdayInYear(leap, 2028))).toEqual([2028, 2, 29]);
		expect(ymd(birthdayInYear(leap, 2027))).toEqual([2027, 2, 28]);
		expect(ymd(birthdayInYear(leap, 2100))).toEqual([2100, 2, 28]); // not a leap year
		expect(birthdayInYear({ month: 11, day: 30 }, 2026).getHours()).toBe(0);
	});

	it('gives the next one, today included', () => {
		const today = new Date(2026, 10, 22, 15, 30);
		expect(ymd(nextBirthday({ month: 11, day: 22 }, today))).toEqual([2026, 11, 22]);
		expect(ymd(nextBirthday({ month: 11, day: 30 }, today))).toEqual([2026, 11, 30]);
		expect(ymd(nextBirthday({ month: 11, day: 21 }, today))).toEqual([2027, 11, 21]);
		expect(ymd(nextBirthday({ month: 1, day: 1 }, today))).toEqual([2027, 1, 1]);
		// Feb 29 after Feb 28 of a year without one: Feb 28 has passed, so next year's (2028: 29)
		expect(ymd(nextBirthday({ month: 2, day: 29 }, new Date(2027, 2, 1)))).toEqual([2028, 2, 29]);
		expect(ymd(nextBirthday({ month: 2, day: 29 }, new Date(2027, 1, 28)))).toEqual([2027, 2, 28]);
	});

	it('counts the days, also across a daylight saving change and the new year', () => {
		const today = new Date(2026, 10, 22, 23, 59);
		expect(daysUntil(new Date(2026, 10, 22), today)).toBe(0);
		expect(daysUntil(new Date(2026, 10, 30), today)).toBe(8);
		expect(daysUntil(new Date(2027, 0, 1), today)).toBe(40);
		expect(daysUntil(new Date(2027, 2, 15), new Date(2027, 2, 1))).toBe(14); // DST in March
		expect([0, 1, 8].map(daysUntilText)).toEqual(['today', 'tomorrow', 'in 8 days']);
	});
});

describe('formatBirthday, birthdayName and birthdayPicture', () => {
	it('shows the day without a year', () => {
		expect(formatBirthday('11-30')).toBe('Nov 30');
		expect(formatBirthday('02-29')).toBe('Feb 29');
		expect(formatBirthday('')).toBe('');
		expect(formatBirthday('04-31')).toBe('');
	});

	it('names the day like the slides name the person', () => {
		expect(birthdayName({ name: 'Bluey', title: '' })).toBe("Bluey's Birthday");
		expect(birthdayName({ name: 'Smith', title: 'Mr.' })).toBe("Mr. Smith's Birthday");
	});

	it("uses the person's picture, else the birthday cake", () => {
		const withPicture = person({ avatar: 'bluey_abc.png' });
		expect(birthdayPicture(withPicture)).toBe(
			`${PUBLIC_POCKETBASE_URL}/api/files/pbc_1795321340/${withPicture.id}/bluey_abc.png`
		);
		expect(birthdayPicture(person({}))).toBe(BIRTHDAY_PICTURE);
	});
});

describe('birthdaysForMonth (what the calendar slide shows)', () => {
	const bluey = person({ name: 'Bluey', birthday: '11-30' });
	const bingo = person({ name: 'Bingo', birthday: '11-30', avatar: 'bingo.png' });
	const smith = person({ name: 'Smith', title: 'Mr.', birthday: '11-03' });
	const off = person({ name: 'Muffin', birthday: '11-12', active: false });
	const none = person({ name: 'Socks', birthday: '' });
	const guest = person({ name: 'Nana', birthday: '11-20' }); // guests count like everyone

	it('shows active people with a birthday, by day and then by name', () => {
		const days = birthdaysForMonth([bluey, off, smith, none, bingo, guest], 2026, 10);
		expect(days.map((d) => [d.dateObj.getDate(), d.name])).toEqual([
			[3, "Mr. Smith's Birthday"],
			[20, "Nana's Birthday"],
			[30, "Bingo's Birthday"],
			[30, "Bluey's Birthday"]
		]);
		expect(birthdaysForMonth([bluey], 2026, 9)).toEqual([]);
		expect(birthdaysForMonth([], 2026, 10)).toEqual([]);
	});

	it('gives each the fields the slide and the editors read', () => {
		const [day] = birthdaysForMonth([bluey], 2026, 10);
		expect(day).toMatchObject({
			name: "Bluey's Birthday",
			date: '2026-11-30 00:00:00',
			local: 'birthday',
			school: 'full',
			personId: bluey.id,
			image: BIRTHDAY_PICTURE,
			description: ''
		});
		expect(day.dateObj).toEqual(new Date(2026, 10, 30));
		expect(day.end).toEqual(new Date(2026, 11, 1));
		expect(birthdaysForMonth([bingo], 2026, 10)[0].image).toContain('/bingo.png');
	});

	it('shows Feb 29 on Feb 28 when the year has none', () => {
		const leap = person({ name: 'Leap', birthday: '02-29' });
		expect(birthdaysForMonth([leap], 2027, 1).map((d) => d.dateObj.getDate())).toEqual([28]);
		expect(birthdaysForMonth([leap], 2028, 1).map((d) => d.dateObj.getDate())).toEqual([29]);
		expect(birthdaysForMonth([leap], 2027, 2)).toEqual([]);
	});

	it('skips a birthday that is not a real day', () => {
		expect(birthdaysForMonth([person({ birthday: '04-31' })], 2026, 3)).toEqual([]);
		expect(showsBirthday({ active: true, birthday: '04-31' })).toBe(false);
		expect(showsBirthday({ active: true, birthday: '04-30' })).toBe(true);
		expect(showsBirthday({ active: false, birthday: '04-30' })).toBe(false);
	});
});

describe('upcomingBirthdays (the Calendar Observances list)', () => {
	it('sorts by the next birthday, today first, then by name', () => {
		const today = new Date(2026, 10, 22, 8);
		const list = upcomingBirthdays(
			[
				person({ name: 'Zed', birthday: '11-22' }),
				person({ name: 'Earlier', birthday: '11-21' }),
				person({ name: 'Bluey', birthday: '11-30' }),
				person({ name: 'Anna', birthday: '11-22' }),
				person({ name: 'Off', birthday: '11-23', active: false }),
				person({ name: 'None' }),
				person({ name: 'New Year', birthday: '01-01' })
			],
			today
		);
		expect(list.map((b) => [b.person.name, ymd(b.date), b.days])).toEqual([
			['Anna', [2026, 11, 22], 0],
			['Zed', [2026, 11, 22], 0],
			['Bluey', [2026, 11, 30], 8],
			['New Year', [2027, 1, 1], 40],
			['Earlier', [2027, 11, 21], 364]
		]);
	});

	it('counts a Feb 29 birthday to Feb 28 in a year without one', () => {
		const [leap] = upcomingBirthdays([person({ birthday: '02-29' })], new Date(2027, 1, 20));
		expect([ymd(leap.date), leap.days]).toEqual([[2027, 2, 28], 8]);
	});
});
