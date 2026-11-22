import { MoonPhase } from 'astronomy-engine';

/** The eight phases, every 45 degrees of the Moon's phase angle (0 = New Moon, 180 = Full Moon). */
export const MOON_PHASES: readonly (readonly [name: string, file: string])[] = [
	['New Moon', 'new-moon.png'],
	['Waxing Crescent', 'waxing-crescent.png'],
	['First Quarter', 'first-quarter.png'],
	['Waxing Gibbous', 'waxing-gibbous.png'],
	['Full Moon', 'full-moon.png'],
	['Waning Gibbous', 'waning-gibbous.png'],
	['Last Quarter', 'last-quarter.png'],
	['Waning Crescent', 'waning-crescent.png']
];

/**
 * The days of a month on which the Moon reaches each phase, as day of the month -> index into
 * MOON_PHASES. A phase belongs to the local day during which the phase angle passes its
 * angle (k * 45 degrees): angle(midnight) < k * 45 <= angle(next midnight), allowing for the wrap
 * from 360 to 0. For the New Moon, quarters and Full Moon this is the local date of astronomy-
 * engine's SearchMoonQuarter; the crescents and gibbous phases are placed the same way, halfway
 * between them.
 * @param month - 0 = January, like Date.
 * @param phaseAngle - the Moon's phase angle in degrees at a time (astronomy-engine's MoonPhase).
 */
export const moonPhaseDays = (
	year: number,
	month: number,
	phaseAngle: (date: Date) => number = MoonPhase
): Map<number, number> => {
	const days = new Map<number, number>();
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	let angle = phaseAngle(new Date(year, month, 1));
	for (let day = 1; day <= daysInMonth; day++) {
		const next = phaseAngle(new Date(year, month, day + 1));
		// how far the angle moves during the day (about 12 degrees, always under 45)
		const moved = (((next - angle) % 360) + 360) % 360;
		for (let k = 0; k < MOON_PHASES.length; k++) {
			const toTarget = (((k * 45 - angle) % 360) + 360) % 360;
			if (toTarget > 0 && toTarget <= moved) days.set(day, k);
		}
		angle = next;
	}
	return days;
};
