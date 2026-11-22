import { describe, expect, it } from 'vitest';
import { compareByName, plural, remove, upsert, withNeighbours } from './list.ts';

let nextId = 0;
const record = (name: string, id = `id${String(nextId++).padStart(13, '0')}`) => ({ id, name });

describe('compareByName', () => {
	it("sorts like PocketBase's sort: 'name' (plain text order)", () => {
		const names = ['finn', 'Finn', 'Dora', 'Ánna', 'Bluey', 'bluey', 'Zed', '3D Kid'];
		const sorted = names.map((name) => record(name)).sort(compareByName);
		expect(sorted.map((r) => r.name)).toEqual([
			'3D Kid',
			'Bluey',
			'Dora',
			'Finn',
			'Zed',
			'bluey',
			'finn',
			'Ánna'
		]);
	});

	it('keeps records with the same name in a stable order', () => {
		const a = record('Sam', 'aaaaaaaaaaaaaaa');
		const b = record('Sam', 'bbbbbbbbbbbbbbb');
		expect([b, a].sort(compareByName)).toEqual([a, b]);
		expect(compareByName(a, a)).toBe(0);
	});
});

describe('upsert / remove', () => {
	it('adds, replaces and removes by id without touching the original list', () => {
		const a = record('A');
		const b = record('B');
		const list = [a, b];

		const added = upsert(list, record('C'));
		expect(added.map((r) => r.name)).toEqual(['A', 'B', 'C']);

		const renamed = upsert(list, { ...a, name: 'A2' });
		expect(renamed.map((r) => r.name)).toEqual(['A2', 'B']);
		expect(list.map((r) => r.name)).toEqual(['A', 'B']);

		expect(remove(list, a.id)).toEqual([b]);
		expect(remove(list, 'missing')).toEqual(list);
	});
});

describe('withNeighbours', () => {
	const list = ['a', 'b', 'c'].map((id) => record(id, id));

	it('gives the id, then the next row, then the one before', () => {
		expect(withNeighbours(list, 'b')).toEqual(['b', 'c', 'a']);
		expect(withNeighbours(list, 'a')).toEqual(['a', 'b']);
		expect(withNeighbours(list, 'c')).toEqual(['c', 'b']);
	});

	it('gives just the id when it is not in the list', () => {
		expect(withNeighbours(list, 'z')).toEqual(['z']);
		expect(withNeighbours([], 'z')).toEqual(['z']);
	});
});

describe('plural', () => {
	it('counts things', () => {
		expect(plural(0, 'day')).toBe('0 days');
		expect(plural(1, 'day')).toBe('1 day');
		expect(plural(12, 'day')).toBe('12 days');
		expect(plural(2, 'person', 'people')).toBe('2 people');
	});
});
