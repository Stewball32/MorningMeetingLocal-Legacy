import { getPbImageUrl, pb } from '#lib/pb/index.ts';
import type { CalendarObservance } from '#lib/pb/types.ts';
import Holidays, { type HolidaysTypes } from 'date-holidays';

export interface Holiday extends HolidaysTypes.Holiday {
	description: string;
	dateObj: Date;
	image: string;
	local: string;
	school: CalendarObservance['school'];
}

// date-holidays writes typographic apostrophes ("Valentine’s Day"), while names
// typed into PocketBase usually use a plain ' — treat them as the same name.
const normalizeHolidayName = (name: string) => name.replace(/[‘’ʼ]/g, "'").trim();

export const isSameHolidayName = (a: string, b: string) =>
	normalizeHolidayName(a) === normalizeHolidayName(b);

const createHoliday = (HolidayRecord: CalendarObservance, year: number, month: number) => {
	const customHolidays = new Holidays();
	for (const date of HolidayRecord.dates) {
		console.log(
			`Adding custom holiday: ${HolidayRecord.name} on ${date} (${HolidayRecord.school})`
		);
		customHolidays.setHoliday(date, {
			name: HolidayRecord.name,
			type: 'school',
			description: HolidayRecord.description ?? '',
			image: HolidayRecord.image
				? getPbImageUrl(HolidayRecord.collectionId, HolidayRecord.id, HolidayRecord.image)
				: '',
			local: 'local',
			school: HolidayRecord.school ?? 'full'
		});
	}
	return (
		customHolidays
			.getHolidays(year)
			.filter((h) => !h.substitute && new Date(h.date).getMonth() === month)
			.map(
				(h) =>
					({
						...h,
						dateObj: new Date(h.date)
					}) as Holiday
			) ?? []
	);
};

export const getHolidayMap = async (year: number, month: number) => {
	const newHMap = new Map<number, Holiday[]>();

	// 1. Get federal holidays
	let holidays =
		new Holidays('US')
			.getHolidays(year)
			.filter((h) => !h.substitute && new Date(h.date).getMonth() === month)
			.map(
				(h) =>
					({
						...h,
						// date-holidays 3.39 writes ’; keep showing the plain ' the slides always had
						name: normalizeHolidayName(h.name),
						description: '',
						dateObj: new Date(h.date),
						image: '',
						local: 'federal',
						school: h.type !== 'public' ? 'full' : 'none'
					}) as Holiday
			) ?? [];

	// 2. Get state holidays
	// const stateHolidays =
	// 	new Holidays('US', 'CA')
	// 		.getHolidays(year)
	// 		.filter(
	// 			(h) =>
	// 				!h.substitute &&
	// 				new Date(h.date).getMonth() === month &&
	// 				!holidays.some((f) => f.name === h.name)
	// 		)
	// 		.filter((h) => !ignoredHolidays.includes(h.name))
	// 		.map(
	// 			(h) =>
	// 				({
	// 					...h,
	// 					description: '',
	// 					dateObj: new Date(h.date),
	// 					image: '',
	// 					local: 'federal',
	// 					school: h.type !== 'public' ? 'full' : 'none'
	// 				}) as Holiday
	// 		) ?? [];

	//3. Merge federal and state holidays
	// holidays = [...holidays, ...stateHolidays];

	// 4. Get local holidays from PocketBase
	const pbRecords = await pb.collection('calendar_observances').getFullList<CalendarObservance>({
		filter: 'is_active = true'
	});

	// 5. Merge PocketBase records with matching federal and state holidays
	const localHolidays: Holiday[] = [];
	for (const record of pbRecords) {
		if (!record.dates || record.dates.length === 0) {
			// Try to match with federal by name
			const holidayIndex = holidays.findIndex((f) => isSameHolidayName(f.name, record.name));
			if (holidayIndex !== -1) {
				// Merge federal holiday with PocketBase record
				holidays[holidayIndex] = {
					...holidays[holidayIndex],
					description: record.description ?? '',
					school: record.school ?? holidays[holidayIndex].school,
					image: record.image
						? getPbImageUrl(record.collectionId, record.id, record.image)
						: holidays[holidayIndex].image
				};
			}
		} else {
			let newCustomHolidays = createHoliday(record, year, month);
			newCustomHolidays.forEach((h) => {
				localHolidays.push(h);
			});
		}
	}

	// 7. Combine and group by day
	holidays = [...holidays, ...localHolidays];

	for (const h of holidays) {
		const day = h.dateObj.getDate();
		if (!newHMap.has(day)) newHMap.set(day, []);
		newHMap.get(day)!.push(h);
	}

	return newHMap;
};
