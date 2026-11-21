import { getAllStudents, getAllTeachers } from '#lib/pb/index.ts';
import type { Student, Teacher } from '#lib/pb/types.ts';
import type { LayoutLoad } from './$types';

export const ssr = false;

export const load = (async ({ data }) => {

    return {
    };
}) satisfies LayoutLoad;

