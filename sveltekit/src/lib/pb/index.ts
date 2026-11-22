import { PUBLIC_POCKETBASE_URL } from '$app/env/public';
import PocketBase from 'pocketbase';
import type { ClassDaily, IconRecord, GuestDaily, Person, PersonDaily } from './types';
import { getCurrentISOString, isISOString } from '#lib';

function createInstance() {
	return new PocketBase(PUBLIC_POCKETBASE_URL);
}

/**
 * Creates a new instance of PocketBase.
 * @returns A new PocketBase instance.
 */
export const pb = createInstance();

export const getPbImageUrl = (collectionId: string, recordId: string, fileId: string) => {
	return `${PUBLIC_POCKETBASE_URL}/api/files/${collectionId}/${recordId}/${fileId}`;
};

/** Every person's attendance lives here: one record per person and date. */
const PEOPLE_DAILIES = 'people_dailies';

/** Daily logs only belong to records of the `people` collection. */
const isPersonRecord = (person: Person) => {
	if (person?.collectionName === 'people') return true;
	console.error('Invalid collection name');
	return false;
};

/**
 * Gets everyone (students, teachers and regular guests, active or not), sorted by name.
 * Which of them a slide shows is up to the slide (see #lib/slides/people.ts).
 * @returns An array of Person objects. Empty array if error or no data.
 */
export const getAllPeople = async (): Promise<Person[]> => {
	console.log('Fetching all people...');
	try {
		const people = (await pb.collection('people').getFullList({ sort: 'name' })) as Person[];
		console.log('Fetched all people');
		return people;
	} catch (error) {
		console.error(error);
		return [];
	}
};

export const getGuestAvatar = async (id: string): Promise<IconRecord | null> => {
	try {
		const guestAvatar = (await pb.collection('icons').getOne(id)) as IconRecord;
		return guestAvatar;
	} catch (error) {
		console.error(error);
		return null;
	}
};

export const getGuestAvatarMap = async (): Promise<Map<string, IconRecord>> => {
	const guestAvatarMap = new Map<string, IconRecord>();
	try {
		const guestAvatars = (await pb.collection('icons').getFullList({
			filter: 'for_guests = true',
			sort: 'name'
		})) as IconRecord[];
		guestAvatars.forEach((avatar) => {
			guestAvatarMap.set(avatar.id, avatar);
		});
		return guestAvatarMap;
	} catch (error) {
		console.error(error);
		return guestAvatarMap;
	}
};

export const getClassDaily = async (isoString?: string): Promise<ClassDaily> => {
	const dateString = isoString ?? getCurrentISOString();
	if (!isISOString(dateString)) throw new Error(`Invalid date string: ${dateString}`);
	let classDaily: ClassDaily;
	try {
		if (isISOString(dateString)) {
			classDaily = await pb.collection('class_dailies').getFirstListItem(`date = "${dateString}" `);
		} else {
			// create a new class daily record if the date is not valid
			classDaily = await pb.collection('class_dailies').create({ date: dateString });
		}
		return classDaily;
	} catch (error) {
		console.debug(error);
		console.warn(`No class daily found! creating new daily...`);
		classDaily = await pb.collection('class_dailies').create({ date: dateString });
		if (!classDaily) throw new Error(`Error creating class daily: ${error}`);
		return classDaily;
	}
};

/**
 * Gets a map of person IDs to their daily logs for one date.
 * @param isoString - YYYY-MM-DD format. Defaults to today's date.
 * @returns A Map of person IDs to PersonDaily records. Empty map if error or no data.
 */
export const getPersonDailyMap = async (isoString?: string): Promise<Map<string, PersonDaily>> => {
	const personDailyMap = new Map<string, PersonDaily>();
	const dateString = isoString ?? getCurrentISOString();
	if (!isISOString(dateString)) return personDailyMap;

	try {
		const personDailies = (await pb.collection(PEOPLE_DAILIES).getFullList({
			filter: `date = "${dateString}"`,
			sort: '-created'
		})) as PersonDaily[];
		personDailies.forEach((daily) => {
			personDailyMap.set(daily.person, daily);
		});
		return personDailyMap;
	} catch (error) {
		console.error(error);
		return personDailyMap;
	}
};

/**
 * Gets a list of guest dailies for the specified date range.
 * @param before - The end date of the range (inclusive). Defaults to today.
 * @param after - The start date of the range (inclusive). Defaults to today.
 * @returns An array of GuestDaily records. Empty array if error or no data.
 */
export const getGuestDailiesRange = async ({
	before,
	after
}: { before?: string; after?: string } = {}): Promise<GuestDaily[]> => {
	const guestDailies: GuestDaily[] = [];
	const startDateString = after?.toString();
	const endDateString = before ?? getCurrentISOString();
	console.log('endDateString', endDateString);
	if (!isISOString(endDateString) && (!startDateString || !isISOString(startDateString)))
		return guestDailies;

	try {
		const filter = startDateString
			? `date >= "${startDateString}" && date <= "${endDateString}"`
			: `date = "${endDateString}"`;
		const guestDailiesData = (await pb.collection('guest_dailies').getFullList({
			filter
		})) as GuestDaily[];
		console.log(guestDailiesData);
		guestDailies.push(...guestDailiesData);
	} catch (error) {
		console.error(error);
		return guestDailies;
	}

	return guestDailies;
};

export const getGuestDailiesDate = async (isoString?: string): Promise<GuestDaily[]> => {
	const dateString = isoString ?? getCurrentISOString();
	if (!isISOString(dateString)) return [];
	try {
		const guestDailies = (await pb.collection('guest_dailies').getFullList({
			filter: `date = "${dateString}"`,
			sort: '-created'
		})) as GuestDaily[];
		return guestDailies;
	} catch (error) {
		console.error(error);
		return [];
	}
};

/**
 * Creates a new class daily record.
 * @param daily - The data for the new class daily record.
 * @returns The created ClassDaily record or null if an error occurs.
 */
const createClassDaily = async (daily: Partial<ClassDaily>) => {
	const dateString = daily?.date || getCurrentISOString();
	if (!isISOString(dateString)) throw new Error(`Invalid date string: ${dateString}`);
	daily = { ...daily, date: dateString };

	try {
		const record = await pb.collection('class_dailies').create(daily);
		return record;
	} catch (error) {
		throw Error(`Error creating class daily: ${error}`);
	}
};

/**
 * Updates a class daily record with the given data.
 * @param daily - The data to update the class daily record with.
 * @returns The updated ClassDaily record or null if an error occurs.
 */
export const updateClassDaily = async (daily: Partial<ClassDaily>) => {
	const dateString = daily?.date || getCurrentISOString();
	if (!isISOString(dateString)) throw new Error(`Invalid date string: ${dateString}`);
	daily = { ...daily, date: dateString };

	try {
		const existingDaily = await pb
			.collection('class_dailies')
			.getFirstListItem(`date = "${dateString}"`);
		if (!existingDaily) {
			console.log(`No existing class daily record found for ${dateString}. Creating a new one.`);
			return await createClassDaily(daily);
		}
		const record = await pb.collection('class_dailies').update(existingDaily.id, daily);
		return record;
	} catch (error) {
		throw Error(`Error updating class daily: ${error}`);
	}
};

/**
 * Creates a daily log for a person.
 * @param person - Person object.
 * @param daily - Daily log data.
 * @returns The created PersonDaily record. Throws if an error occurs.
 */
const createPersonDaily = async (person: Person, daily: Partial<PersonDaily>) => {
	// I don't need to recheck if this is only called from func updateDaily.
	// uncomment if exporting this function.
	//
	// const isoString = daily?.date || getCurrentISOString()
	// if (!isISOString(isoString)) return null
	// daily = { ...daily, date: isoString }
	//
	// if (!isPersonRecord(person)) return null

	const dailyData: Partial<PersonDaily> = { ...daily, person: person.id };
	try {
		const record = await pb.collection(PEOPLE_DAILIES).create(dailyData);
		return record;
	} catch (error) {
		throw new Error(`Error creating ${PEOPLE_DAILIES} record: ${error}`);
	}
};

/**
 * Updates a person's daily log with the given data.
 * Creates a new log if one does not exist.
 * @param person - Person object.
 * @param daily - The data to update the daily log with.
 * @returns The updated PersonDaily record or null if an error occurs.
 */
export const updatePersonDaily = async (person: Person, daily: Partial<PersonDaily>) => {
	const isoString = daily?.date || getCurrentISOString();
	if (!isISOString(isoString)) throw new Error(`Invalid date string: ${isoString}`);
	daily = { ...daily, date: isoString };

	if (!isPersonRecord(person)) return null;

	const dailyMap = await getPersonDailyMap();
	const existingDaily = dailyMap.get(person.id);
	if (!existingDaily) {
		console.log(`No existing daily record found for ${person.name} on . Creating a new one.`);
		// Create a new daily record if one does not exist
		return await createPersonDaily(person, daily);
	}
	// Update the existing daily record
	const newDaily = { ...existingDaily, ...daily };
	try {
		const record = await pb.collection(PEOPLE_DAILIES).update(existingDaily.id, newDaily);
		return record;
	} catch (error) {
		console.error(error);
		return null;
	}
};

/**
 * Deletes a person's daily log.
 * @param person - Person object.
 * @param isoString - The date of the daily log to delete. Defaults to today's date.
 * @returns true once deleted, or null if there is none or an error occurs.
 * */
export const deletePersonDaily = async (person: Person, isoString: string) => {
	isoString = isoString ?? getCurrentISOString();
	if (!isISOString(isoString)) throw new Error(`Invalid date string: ${isoString}`);

	if (!isPersonRecord(person)) return null;

	const dailyMap = await getPersonDailyMap(isoString);
	const existingDaily = dailyMap.get(person.id);
	if (!existingDaily) {
		console.log(`No existing daily record found for ${person.name} on ${isoString}.`);
		return null;
	}
	try {
		const record = await pb.collection(PEOPLE_DAILIES).delete(existingDaily.id);
		return record;
	} catch (error) {
		console.error(error);
		return null;
	}
};

// findDaily
/**
 * Finds a person's daily log by date.
 * * @param person - Person object.
 * * @param isoString - The date of the daily log to find. Defaults to today's date.
 * * @returns The PersonDaily if found, or null if not found or an error occurs.
 */
export const findPersonDaily = async (person: Person, isoString?: string) => {
	isoString = isoString ?? getCurrentISOString();
	if (!isISOString(isoString)) throw new Error(`Invalid date string: ${isoString}`);

	if (!isPersonRecord(person)) return null;

	const dailyMap = await getPersonDailyMap(isoString);
	const existingDaily = dailyMap.get(person.id);
	if (!existingDaily) {
		console.log(`No existing daily record found for ${person.name} on ${isoString}.`);
		return null;
	}
	return existingDaily;
};

// createGuestDaily
/**
 * Creates a new guest daily record.
 * @param daily - The data for the new guest daily record.
 * @returns The created GuestDaily record. Throws if an error occurs, with PocketBase's error as
 * the cause (e.g. a unique index clash: that guest is already checked in that day).
 */
export const createGuestDaily = async (daily: Partial<GuestDaily>) => {
	const dateString = daily?.date || getCurrentISOString();
	if (!isISOString(dateString)) throw new Error(`Invalid date string: ${dateString}`);
	daily = { ...daily, date: dateString };

	try {
		const record = (await pb.collection('guest_dailies').create(daily)) as GuestDaily;
		return record;
	} catch (error) {
		throw new Error(`Error creating guest daily: ${error}`, { cause: error });
	}
};

export const updateGuestDaily = async (daily: Partial<GuestDaily>) => {
	const dateString = daily?.date || getCurrentISOString();
	if (!isISOString(dateString)) throw new Error(`Invalid date string: ${dateString}`);
	daily = { ...daily, date: dateString };

	try {
		const existingDaily = await pb
			.collection('guest_dailies')
			.getFirstListItem(`date = "${dateString}"`);
		if (!existingDaily) {
			console.log(`No existing guest daily record found for ${dateString}. Creating a new one.`);
			return await createGuestDaily(daily);
		}
		const record = (await pb
			.collection('guest_dailies')
			.update(existingDaily.id, daily)) as GuestDaily;
		return record;
	} catch (error) {
		throw Error(`Error updating guest daily: ${error}`);
	}
};

export const deleteGuestDaily = async (daily: GuestDaily) => {
	try {
		const record = await pb.collection('guest_dailies').delete(daily.id);
		return record;
	} catch (error) {
		throw Error(`Error deleting guest daily: ${error}`);
	}
};
