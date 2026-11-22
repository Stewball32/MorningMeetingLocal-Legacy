/** Local midnight of a YYYY-MM-DD date (never `new Date('YYYY-MM-DD')`, which is UTC). */
export const dateOf = (isoDate: string | undefined): Date | undefined => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate ?? '');
	if (!match) return undefined;
	const [year, month, day] = match.slice(1).map(Number);
	const date = new Date(year, month - 1, day);
	return date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
};

/**
 * The month page's week-label column, one entry per grid row (the weekday header first): null
 * for no label, else the week's index (0 = "1st"). `startDay` is how many cells of the first row
 * belong to the previous month. A first week with fewer than six of the month's days (startDay
 * above 1) gets no label, and every other row does.
 */
export const weekLabels = (startDay: number, daysInMonth: number): (number | null)[] => {
	const rows = Math.ceil((daysInMonth + startDay) / 7);
	const unlabeled = startDay > 1 ? 1 : 0;
	return [
		...Array<null>(1 + unlabeled).fill(null),
		...Array.from({ length: rows - unlabeled }, (_, i) => i)
	];
};
