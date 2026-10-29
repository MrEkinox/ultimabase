// A live list's window (D-154): its first rows and one more.
import { expect, it } from 'vitest'
import { Window } from './window.ts'

it('keeps one row more than it shows, then says rows follow', () => {
	const window = new Window([{ field: 'id', direction: 'asc' }], 1)
	for (const id of ['c', 'a', 'b']) window.place({ id, keys: [id] })
	expect(window.entries.map(({ id }) => id)).toEqual(['a', 'b'])
	expect(window.rest).toBe(true)
	window.place({ id: 'd', keys: ['d'] })
	expect(window.entries.map(({ id }) => id)).toEqual(['a', 'b'])
})
