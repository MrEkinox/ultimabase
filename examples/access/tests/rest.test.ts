import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Article } from '../src/articles.ts'
import { ultimabase } from '../src/ultimabase.ts'

// REST enters the same Runtime: the rules decide, never the transport.
it('applies the same rules to REST requests', async () => {
	await using t = await testApplication(ultimabase)
	await t.asMaster(() =>
		Article.createMany({
			data: [{ published: true, title: 'Launch' }, { title: 'Roadmap' }],
		}),
	)

	const articles = await t.fetch('/api/classes/Article?select=title')
	expect(articles.status).toBe(200)
	expect(await articles.json()).toMatchObject({
		results: [{ title: 'Launch' }],
	})

	// An anonymous caller has no note to read: 403, not an empty list.
	const notes = await t.fetch('/api/classes/Note')
	expect(notes.status).toBe(403)
	expect(await notes.json()).toMatchObject({
		error: { code: 'PERMISSION_DENIED' },
	})

	const leak = await t.fetch('/api/classes/Article', {
		body: JSON.stringify({ title: 'Leak' }),
		headers: { 'content-type': 'application/json' },
		method: 'POST',
	})
	expect(leak.status).toBe(403)
	expect(await t.asMaster(() => Article.count())).toBe(2)
})
