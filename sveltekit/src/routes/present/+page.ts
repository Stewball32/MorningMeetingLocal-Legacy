import { getCurrentISOString } from '#lib';
import {
	getAllPeople,
	getClassDaily,
	getGuestAvatarMap,
	getGuestDailiesDate,
	getPersonDailyMap
} from '#lib/pb/index.ts';
import type { PageLoad } from './$types';

export const load = (async ({ params, url }) => {
	const todayISOString = getCurrentISOString();
	const classDaily = await getClassDaily();
	const people = await getAllPeople();
	const personDailyMap = await getPersonDailyMap();
	const guestDailies = await getGuestDailiesDate();
	const guestAvatarMap = await getGuestAvatarMap();

	return {
		todayISOString,
		classDaily,
		people,
		personDailyMap,
		guestDailies,
		guestAvatarMap
	};
}) satisfies PageLoad;
