// One flush's changes by model (D-154).
import { expect, it } from 'vitest'
import { batchOf, touched } from './changes.ts'
import { schema } from './test/schema.ts'

it('reads a link of an unknown relation on its own side only', () => {
	const batch = batchOf(
		[{ kind: 'link', model: 'Post', field: 'gone', pairs: [['p1', 't1']] }],
		schema,
	)
	expect([...batch.keys()]).toEqual(['Post'])
})

it('reads an update that lists no fields as one of every field', () => {
	const batch = batchOf(
		[{ kind: 'update', model: 'Post', ids: ['p1'] }],
		schema,
	)
	expect(batch.get('Post')?.fields).toBe('all')
	expect(touched(batch.get('Post'), new Set(['title']))).toBe(true)
})
