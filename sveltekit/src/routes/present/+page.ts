import { error } from '@sveltejs/kit';
import { getCurrentISOString } from '#lib';
import {
	findClassDaily,
	getAllPeople,
	getGuestDailiesDate,
	getIconMap,
	getPersonDailyMap
} from '#lib/pb/index.ts';
import { isUnreachable } from '#lib/present/saveError.ts';
import type { PageLoad } from './$types';

// Only reads: a preload (or a load that fails half-way) never writes. When today has no
// class_dailies record yet, the page creates it once it is shown.
export const load = (async () => {
	const todayISOString = getCurrentISOString();
	try {
		const [classDaily, people, personDailyMap, guestDailies, guestAvatarMap] = await Promise.all([
			findClassDaily(todayISOString),
			getAllPeople(),
			getPersonDailyMap(todayISOString),
			getGuestDailiesDate(todayISOString),
			getIconMap()
		]);
		return {
			todayISOString,
			classDaily,
			people,
			personDailyMap,
			guestDailies,
			guestAvatarMap
		};
	} catch (cause) {
		console.error(cause);
		if (isUnreachable(cause)) error(503, "Can't reach PocketBase, where the class's data is kept.");
		error(500, "PocketBase couldn't load today's presenter data.");
	}
}) satisfies PageLoad;
