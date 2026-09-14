import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { generateApplicationTypes } from '@ultimabase/typegen'

import { createApiFixture } from './fixtures/apis/application'
import { ApiPost } from './fixtures/apis/schema'
import { apiPostRow } from './fixtures/apis/test-database'

const contentRoot = fileURLToPath(
	new URL('../content/docs/en/apis/', import.meta.url),
)
const generatedPath = fileURLToPath(
	new URL('./fixtures/apis/.ultimabase/schema.generated.d.ts', import.meta.url),
)
const pageNames = [
	'errors',
	'graphql',
	'graphql-yoga',
	'http-applications',
	'rest',
	'typescript',
] as const
let documentation = ''
let fixture: Awaited<ReturnType<typeof createApiFixture>>

const httpRequest = async (
	pathName: string,
	init: Readonly<{
		readonly body?: string
		readonly contentType?: string
	}> = {},
): Promise<Response> => {
	const headers = new Headers({ 'X-UltimaBase-Application-Id': 'docs' })
	const originalHeaders: [string, string][] = [
		['X-UltimaBase-Application-Id', 'docs'],
	]
	if (init.contentType !== undefined) {
		headers.set('Content-Type', init.contentType)
		originalHeaders.push(['Content-Type', init.contentType])
	}
	return fixture.http.fetch({
		originalHeaders,
		request: new Request(`https://docs.example${pathName}`, {
			...(init.body === undefined ? {} : { body: init.body }),
			headers,
			method: init.body === undefined ? 'GET' : 'POST',
		}),
	})
}

beforeAll(async () => {
	documentation = (
		await Promise.all(
			pageNames.map((pageName) =>
				readFile(path.join(contentRoot, `${pageName}.mdx`), 'utf8'),
			),
		)
	).join('\n')
	fixture = await createApiFixture()
})

afterAll(async () => {
	await fixture.application.dispose()
})

describe('public API documentation contracts', () => {
	it('keeps generated API declarations synchronized', async () => {
		const generated = generateApplicationTypes({
			application: fixture.application.application,
			applicationId: 'website-apis',
		})
		expect(generated.contents).toBe(await readFile(generatedPath, 'utf8'))
	})

	it('executes TypeScript, REST, networkless GraphQL, and Yoga consistently', async () => {
		const direct = await ApiPost.findMany(
			{ select: { id: true, title: true } },
			{ ultimabase: fixture.application },
		)
		const rest = await httpRequest('/api/v1/classes/ApiPost?select=id%2Ctitle')
		const graphql = fixture.application.application.getPlugin(
			'@ultimabase/graphql-plugin',
		)
		const context = fixture.application.engine.anonymous({
			requestId: 'website-api-networkless',
			source: 'internal',
		}).context
		const networkless = await graphql.execute({
			context,
			document: '{ findManyApiPost(first: 2) { nodes { id title } } }',
		})
		const yoga = await httpRequest('/graphql', {
			body: JSON.stringify({
				query: '{ findManyApiPost(first: 2) { nodes { id title } } }',
			}),
			contentType: 'application/json',
		})

		expect(direct[0]?.toJSON()).toMatchObject({
			id: apiPostRow.id,
			title: apiPostRow.title,
		})
		expect(rest.status).toBe(200)
		expect(await rest.json()).toEqual({
			results: [{ id: apiPostRow.id, title: apiPostRow.title }],
		})
		expect(networkless).toMatchObject({
			data: {
				findManyApiPost: {
					nodes: [{ id: apiPostRow.id, title: apiPostRow.title }],
				},
			},
		})
		expect(yoga.status).toBe(200)
		expect(await yoga.json()).toMatchObject({
			data: {
				findManyApiPost: {
					nodes: [{ id: apiPostRow.id, title: apiPostRow.title }],
				},
			},
		})
	})

	it('checks protocol ownership and safe error envelopes', async () => {
		const unsupported = await httpRequest('/api/v2/classes/ApiPost')
		expect(unsupported.status).toBe(400)
		expect(await unsupported.json()).toMatchObject({
			error: { code: 'REST_UNSUPPORTED_VERSION', retryable: false },
		})

		expect(documentation).toContain('Exposure is never authorization')
		expect(documentation).toContain(
			'Custom schema resolvers receive only `{ request: RequestContext }`',
		)
		expect(documentation).not.toMatch(
			/transport receives (?:an )?(?:application engine|raw adapter|grant)/iu,
		)
	})
})
