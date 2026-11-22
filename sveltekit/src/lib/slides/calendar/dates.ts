/** Local midnight of a YYYY-MM-DD date (never `new Date('YYYY-MM-DD')`, which is UTC). */
export const dateOf = (isoDate: string | undefined): Date | undefined => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate ?? '');
	if (!match) return undefined;
	const [year, month, day] = match.slice(1).map(Number);
	const date = new Date(year, month - 1, day);
	return date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
};
