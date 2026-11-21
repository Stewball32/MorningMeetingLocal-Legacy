export type ZodiacEntry = [name: string, image: string];

// Indexed by month: the sign that is active on the 1st of that month.
export const zodiacArray: ZodiacEntry[] = [
	['Capricorn', 'capricorn.png'],
	['Aquarius', 'aquarius.png'],
	['Pisces', 'pisces.png'],
	['Aries', 'aries.png'],
	['Taurus', 'taurus.png'],
	['Gemini', 'gemini.png'],
	['Cancer', 'cancer.png'],
	['Leo', 'leo.png'],
	['Virgo', 'virgo.png'],
	['Libra', 'libra.png'],
	['Scorpio', 'scorpio.png'],
	['Sagittarius', 'sagittarius.png']
];

// Last day (in that month) of the sign that is active on the 1st.
export const lastDayOfZodiac = [
	19, // Jan: Capricorn ends 19
	18, // Feb: Aquarius ends 18
	20, // Mar: Pisces ends 20
	19, // Apr: Aries ends 19
	20, // May: Taurus ends 20
	20, // Jun: Gemini ends 20
	22, // Jul: Cancer ends 22
	22, // Aug: Leo ends 22
	22, // Sep: Virgo ends 22
	22, // Oct: Libra ends 22
	21, // Nov: Scorpio ends 21
	21 // Dec: Sagittarius ends 21
];

export const getZodiacSign = (date: Date): ZodiacEntry => {
	const month = date.getMonth(); // 0..11
	const day = date.getDate();

	const idx = day <= lastDayOfZodiac[month] ? month : (month + 1) % 12;

	return zodiacArray[idx];
};
