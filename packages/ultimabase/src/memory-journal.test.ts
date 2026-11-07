// The journal of a memory() write (D-305): what it changes in place, it puts
// back as it was, in the same order, and a transaction's store copies a table
// or join side once, leaving the store it began from untouched.
import { describe, expect, it } from 'vitest'
import { Journal, layer } from './memory-journal.ts'
import type { Store, StoredRow } from './memory-read.ts'

const row = (id: string, label = id): StoredRow => ({ id, label })

const fresh = (): Store => ({
	tables: new Map([
		[
			'Tag',
			new Map([
				['t1', row('t1')],
				['t2', row('t2')],
				['t3', row('t3')],
			]),
		],
	]),
	joins: new Map([['Book.tags', new Map([['b1', new Set(['t1', 't2'])]])]]),
})

describe('Journal', () => {
	it('puts back rows it set, deleted and replaced, in their order', () => {
		const store = fresh()
		const journal = new Journal(store)
		const tags = journal.table('Tag')
		journal.set(tags, row('t2', 'changed'))
		journal.delete(tags, 't1')
		journal.delete(tags, 't3')
		journal.set(tags, row('t4'))
		journal.set(tags, row('t1', 'again'))
		journal.undo()
		expect([...tags.values()]).toEqual([row('t1'), row('t2'), row('t3')])
		// Undone once, the journal holds nothing more to undo.
		journal.undo()
		expect([...tags.keys()]).toEqual(['t1', 't2', 't3'])
	})

	it('puts back links it added and removed, in their order', () => {
		const store = fresh()
		const journal = new Journal(store)
		const side = journal.side('Book.tags')
		const ids = side.get('b1') ?? new Set()
		expect(journal.remove(ids, 't1')).toBe(true)
		expect(journal.remove(ids, 't9')).toBe(false)
		journal.add(ids, 't2')
		journal.add(ids, 't1')
		journal.add(ids, 't3')
		journal.undo()
		expect([...ids]).toEqual(['t1', 't2'])
	})

	it('changes the store itself outside a transaction', () => {
		const store = fresh()
		const journal = new Journal(store)
		expect(journal.table('Tag')).toBe(store.tables.get('Tag'))
		expect(journal.side('Book.tags')).toBe(store.joins.get('Book.tags'))
		// A side no write made yet starts empty.
		expect(journal.side('Tag.books').size).toBe(0)
		expect(store.joins.has('Tag.books')).toBe(true)
	})

	it('copies a table and a side once in a transaction, not the store it began from', () => {
		const store = fresh()
		const next = layer(store)
		const journal = new Journal(next)
		const tags = journal.table('Tag')
		expect(tags).not.toBe(store.tables.get('Tag'))
		journal.delete(tags, 't1')
		const ids = journal.side('Book.tags').get('b1') ?? new Set()
		journal.add(ids, 't3')
		// A later write of the same transaction changes the same copies.
		const later = new Journal(next)
		expect(later.table('Tag')).toBe(tags)
		expect(later.side('Book.tags').get('b1')).toBe(ids)
		expect([...(store.tables.get('Tag')?.keys() ?? [])]).toEqual([
			't1',
			't2',
			't3',
		])
		expect([...(store.joins.get('Book.tags')?.get('b1') ?? [])]).toEqual([
			't1',
			't2',
		])
		expect(next.copied).toEqual(new Set(['Tag', 'Book.tags']))
	})

	it('refuses a model it does not know', () => {
		expect(() => new Journal(fresh()).table('Ghost')).toThrow(
			'Unknown model Ghost.',
		)
	})
})
