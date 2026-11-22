import { PUBLIC_POCKETBASE_URL } from '$app/env/public';
import PocketBase from 'pocketbase';
import type { ClassDaily, IconRecord, GuestDaily, Person, PersonDaily } from './types';
import { getCurrentISOString, isISOString } from '#lib';

function createInstance() {
	const pb = new PocketBase(PUBLIC_POCKETBASE_URL);
	// The SDK would otherwise cancel a pending request as soon as another one with the same key
	// (method and path) starts, e.g. two quick attendance saves, and the first save would be lost.
	// Nothing here needs that: it is meant for search-as-you-type.
	pb.autoCancellation(false);
	return pb;
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
/** The presenter's state for a day (slide, pages, answers): one record per date. */
const CLASS_DAILIES = 'class_dailies';

/** Saves give up after this long, so a request that never gets an answer ends as an error. */
const WRITE_TIMEOUT_MS = 15_000;
const writeOptions = () => ({ requestKey: null, signal: AbortSignal.timeout(WRITE_TIMEOUT_MS) });

/** PocketBase answered 404: no such record (or none matched the filter). */
export const isNotFound = (error: unknown) => (error as { status?: number } | null)?.status === 404;

/** PocketBase refused a save because of a unique index (e.g. one class_dailies record per date). */
export const isNotUnique = (error: unknown) => {
	const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
	if (!data || typeof data !== 'object') return false;
	return Object.values(data as Record<string, { code?: string } | undefined>).some(
		(field) => field?.code === 'validation_not_unique'
	);
};

/** Daily logs only belong to records of the `people` collection. */
const isPersonRecord = (person: Person) => {
	if (person?.collectionName === 'people') return true;
	console.error('Invalid collection name');
	return false;
};

/**
 * Gets everyone (students, teachers and regular guests, active or not), sorted by name.
 * Which of them a slide shows is up to the slide (see #lib/slides/people.ts).
 * @returns An array of Person objects. Throws if PocketBase can't be reached.
 */
export const getAllPeople = async (): Promise<Person[]> => {
	return await pb.collection('people').getFullList<Person>({ sort: 'name' });
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

/**
 * Every icon by id, sorted by name. The Add Guest list only offers the ones for guests (see
 * guestIconOptions), but earlier check-ins may use any of them. Throws if PocketBase can't be
 * reached.
 */
export const getIconMap = async (): Promise<Map<string, IconRecord>> => {
	const icons = await pb.collection('icons').getFullList<IconRecord>({ sort: 'name' });
	return new Map(icons.map((icon) => [icon.id, icon]));
};

/**
 * The class_dailies record for a date, or null if there is none yet. Any other error (PocketBase
 * down, a network error) is thrown: it doesn't mean "no record".
 */
export const findClassDaily = async (date: string): Promise<ClassDaily | null> => {
	try {
		return await pb
			.collection(CLASS_DAILIES)
			.getFirstListItem<ClassDaily>(pb.filter('date = {:date}', { date }), { sort: 'created,id' });
	} catch (error) {
		if (isNotFound(error)) return null;
		throw error;
	}
};

/**
 * Gets the class_dailies record for a date (today by default), and creates it if there is none
 * yet. When two screens create it at the same moment, the unique index on date lets only one of
 * them through and the other one fetches that record: every screen holds the same record.
 */
export const getClassDaily = async (isoString?: string): Promise<ClassDaily> => {
	const date = isoString ?? getCurrentISOString();
	if (!isISOString(date)) throw new Error(`Invalid date string: ${date}`);
	const existing = await findClassDaily(date);
	if (existing) return existing;
	try {
		return await pb.collection(CLASS_DAILIES).create<ClassDaily>({ date }, writeOptions());
	} catch (error) {
		if (!isNotUnique(error)) throw error;
		const created = await findClassDaily(date);
		if (!created) throw error;
		return created;
	}
};

/**
 * Saves fields of a class_dailies record, by its id: never by date, so a screen left open overnight
 * can't write yesterday's state into today's record. A JSON field is replaced as a whole.
 */
export const saveClassDaily = async (id: string, fields: Partial<ClassDaily>) => {
	return await pb.collection(CLASS_DAILIES).update<ClassDaily>(id, fields, writeOptions());
};

/**
 * Gets a map of person IDs to their daily logs for one date.
 * @param isoString - YYYY-MM-DD format. Defaults to today's date.
 * @returns A Map of person IDs to PersonDaily records. Throws if PocketBase can't be reached (an
 * error is never taken for "nobody has a record").
 */
export const getPersonDailyMap = async (isoString?: string): Promise<Map<string, PersonDaily>> => {
	const personDailyMap = new Map<string, PersonDaily>();
	const dateString = isoString ?? getCurrentISOString();
	if (!isISOString(dateString)) return personDailyMap;

	const personDailies = await pb.collection(PEOPLE_DAILIES).getFullList<PersonDaily>({
		filter: pb.filter('date = {:date}', { date: dateString }),
		sort: '-created'
	});
	personDailies.forEach((daily) => {
		personDailyMap.set(daily.person, daily);
	});
	return personDailyMap;
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

/** The guest check-ins of one date. Throws if PocketBase can't be reached. */
export const getGuestDailiesDate = async (isoString?: string): Promise<GuestDaily[]> => {
	const dateString = isoString ?? getCurrentISOString();
	if (!isISOString(dateString)) return [];
	return await pb.collection('guest_dailies').getFullList<GuestDaily>({
		filter: pb.filter('date = {:date}', { date: dateString }),
		sort: '-created'
	});
};

/** A person's people_dailies record for a date, or null if there is none. Throws on other errors. */
const lookupPersonDaily = async (personId: string, date: string): Promise<PersonDaily | null> => {
	try {
		return await pb
			.collection(PEOPLE_DAILIES)
			.getFirstListItem<PersonDaily>(
				pb.filter('date = {:date} && person = {:person}', { date, person: personId })
			);
	} catch (error) {
		if (isNotFound(error)) return null;
		throw error;
	}
};

/**
 * Sets a person's attendance on a date: updates their people_dailies record, or creates one with
 * only date, person and here. `known` is the record the screen already has for them (from the
 * realtime map); it is only used when it is for the same person and date.
 * @returns The saved record. Throws if the save fails.
 */
export const updatePersonDaily = async (
	person: Person,
	{ date, here, known }: { date: string; here: PersonDaily['here']; known?: PersonDaily }
): Promise<PersonDaily> => {
	if (!isISOString(date)) throw new Error(`Invalid date string: ${date}`);
	if (!isPersonRecord(person)) throw new Error(`Not a person: ${person?.id}`);
	const collection = pb.collection(PEOPLE_DAILIES);
	const update = async (record: PersonDaily) => {
		try {
			return await collection.update<PersonDaily>(record.id, { here }, writeOptions());
		} catch (error) {
			if (isNotFound(error)) return null; // deleted in the meantime: create it again
			throw error;
		}
	};

	const usable = known && known.person === person.id && known.date === date ? known : null;
	const existing = usable ?? (await lookupPersonDaily(person.id, date));
	if (existing) {
		const updated = await update(existing);
		if (updated) return updated;
	}
	try {
		return await collection.create<PersonDaily>({ date, person: person.id, here }, writeOptions());
	} catch (error) {
		// another save (from this screen or another one) created it first: update that one
		if (!isNotUnique(error)) throw error;
		const created = await lookupPersonDaily(person.id, date);
		const updated = created && (await update(created));
		if (!updated) throw error;
		return updated;
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

	const existingDaily = await lookupPersonDaily(person.id, isoString);
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
 * * @returns The PersonDaily if found, or null if there is none. Throws if the lookup fails.
 */
export const findPersonDaily = async (person: Person, isoString?: string) => {
	isoString = isoString ?? getCurrentISOString();
	if (!isISOString(isoString)) throw new Error(`Invalid date string: ${isoString}`);

	if (!isPersonRecord(person)) return null;

	return await lookupPersonDaily(person.id, isoString);
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
		throw Error(`Error deleting guest daily: ${error}`, { cause: error });
	}
};
