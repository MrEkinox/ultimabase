import { randomUUID } from 'node:crypto'

import { anonymous } from '@ultimabase/core/plugin'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { ultimabase } from '../src/ultimabase.ts'
import { seedBlog } from './support.ts'

it('prints the schema the application serves', async () => {
	await using t = await testApplication(ultimabase)

	const sdl = ultimabase.plugin('@ultimabase/graphql-plugin').printSchema()
	// The operation's types derive from its validators.
	expect(sdl).toContain(
		'readingTime(input: ReadingTimeInput!): ReadingTimeResult!',
	)
	expect(sdl).toContain(
		[
			'input ReadingTimeInput {',
			'  options: ReadingTimeInputOptions',
			'  pace: ReadingTimeInputPace',
			'  text: String!',
			'}',
		].join('\n'),
	)
	expect(sdl).toContain(
		['enum ReadingTimeInputPace {', '  fast', '  normal', '  slow', '}'].join(
			'\n',
		),
	)
	// `pagination: { defaultTake: 20 }` and `count: true` on Post.
	expect(sdl).toContain(
		'findManyPost(after: String, first: Int = 20, orderBy: [PostOrder!], where: PostWhere): PostConnection!',
	)
	expect(sdl).toContain('countPost(where: PostWhere): SafeInt!')
	expect(sdl).toContain('version: String')
	// Disabled methods and `graphql: false` have no root field or mutation.
	expect(sdl).not.toMatch(/^\s+\w+(?:Author|Comment)\(input/mu)
	expect(sdl).not.toMatch(/^\s+\w+AuditEntry\(/mu)
	expect(sdl).not.toMatch(/^\s+countComment\(/mu)
	await t.afterCommit()
})

it('executes a document without HTTP', async () => {
	await using t = await testApplication(ultimabase)
	await t.asMaster(seedBlog)

	//#region execute
	const graphql = ultimabase.plugin('@ultimabase/graphql-plugin')
	// A request context of the started application, here anonymous.
	const { context } = anonymous(ultimabase, {
		requestId: randomUUID(),
		source: 'internal',
	})
	const result = await graphql.execute({
		context,
		document: '{ findManyPost(first: 2) { nodes { title } } }',
	})
	//#endregion execute

	// GraphQL builds results from null-prototype objects: compare values.
	expect(result).toEqual({
		data: {
			findManyPost: { nodes: [{ title: 'Alpha' }, { title: 'Beta' }] },
		},
	})
})

it('answers introspection and serves GraphiQL in development', async () => {
	await using t = await testApplication(ultimabase)

	const introspection = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query: '{ __type(name: "PostStatus") { name } }' }),
	})
	expect(await introspection.json()).toStrictEqual({
		data: { __type: { name: 'PostStatus' } },
	})

	//#region explorer
	const page = await t.fetch('/graphiql')
	//#endregion explorer

	expect(page.status).toBe(200)
	expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8')
	expect(await page.text()).toContain('<title>UltimaBase GraphiQL</title>')
})
