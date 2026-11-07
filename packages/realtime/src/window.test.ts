// A live list's window (D-154): its first rows and one more.
import { expect, it } from 'vitest'
import { Window } from './window.ts'

it('keeps one row more than it shows, then says rows follow', () => {
	const window = new Window([{ field: 'id', direction: 'asc' }], 1)
	for (const id of ['c', 'a', 'b']) window.place([id])
	expect([window.shown(), window.lastKeys()]).toEqual([['a'], ['b']])
	expect(window.rest).toBe(true)
	window.place(['d'])
	expect([window.shown(), window.lastKeys()]).toEqual([['a'], ['b']])
})

it('keeps its ids as rows are placed, pushed out and removed', () => {
	const window = new Window([{ field: 'id', direction: 'asc' }], 1)
	window.place(['b'])
	window.place(['c'])
	window.place(['a'])
	expect([...window.ids().keys()].toSorted()).toEqual(['a', 'b'])
	expect(window.remove('c')).toBe(false)
	expect(window.remove('a')).toBe(true)
	expect([...window.ids().keys()]).toEqual(['b'])
})

it('finds each row by the id its keys hold, wherever the order puts it', () => {
	const order = [
		{ field: 'rank', direction: 'asc' },
		{ field: 'id', direction: 'asc' },
	] as const
	const window = new Window(order, 2)
	window.place([2, 'b'])
	window.place([1, 'a'])
	expect(window.shown()).toEqual(['a', 'b'])
	expect(() => new Window([{ field: 'rank', direction: 'asc' }], 1)).toThrow(
		'A live order holds the id.',
	)
})

it('tells a row sent as it was, past a move, and a row it does not hold', () => {
	const window = new Window([{ field: 'id', direction: 'asc' }], 2)
	window.place(['a'])
	expect(window.sent('a', { text: 'x' })).toBe(true)
	expect(window.sent('a', { text: 'x' })).toBe(false)
	window.place(['a'])
	expect(window.sent('a', { text: 'x' })).toBe(false)
	expect(window.sent('a', { text: 'y' })).toBe(true)
	expect(window.sent('absent', { text: 'x' })).toBe(true)
})

it('tells its first and last rows when they moved, without the row it hides', () => {
	const window = new Window([{ field: 'id', direction: 'asc' }], 2)
	expect(window.endsMoved()).toBeUndefined()
	window.place(['b'])
	expect(window.endsMoved()).toEqual(['b', 'b'])
	window.place(['c'])
	window.place(['d'])
	expect(window.endsMoved()).toEqual(['b', 'c'])
	expect(window.endsMoved()).toBeUndefined()
	window.place(['a'])
	expect(window.endsMoved()).toEqual(['a', 'b'])
	window.remove('a')
	window.remove('b')
	window.remove('c')
	window.remove('d')
	expect(window.endsMoved()).toEqual([])
	expect(
		new Window([{ field: 'id', direction: 'asc' }], 0).endsMoved(),
	).toBeUndefined()
})
