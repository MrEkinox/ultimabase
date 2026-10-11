import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase, type PolicyPredicate } from '@ultimabase/core'
import {
	anonymous,
	contributeApplication,
	plugin,
	requireCapability,
} from '@ultimabase/core/plugin'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import {
	httpApplicationCapability,
	httpApplicationIdHeader,
	httpPlugin,
	type HttpApplication,
	type HttpOriginalHeader,
} from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'

// ADR-0317, decision 7: Soft Delete declares `readDeleted`, Access grants it
// by a rule of the same name; neither package imports the other.
let auditing = false
const isAuditing: PolicyPredicate = function isAuditing() {
	return auditing
}

const SchemaApplication = UltimaBase.use(softDeletePlugin(), accessPlugin())
const Note = SchemaApplication.Schema.define({
	className: 'ReadDeletedNote',
	fields: (field) => ({ title: field.string({ required: true }) }),
})
	.softDelete()
	.with({
		access: {
			read: true,
			create: true,
			delete: true,
			readDeleted: isAuditing,
		},
	})

const httpRequirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})
const capture: { current?: HttpApplication } = {}
const capturePlugin = plugin({
	contributions: [
		httpRequirement,
		contributeApplication(({ capabilities }) => {
			capture.current = capabilities.get(httpRequirement)
			return { exports: undefined }
		}),
	],
	core: '^0.0.0',
	id: 'fixture.read-deleted-capture',
	version: '1.0.0',
})

const createUltimabase = (database: PostgresWorkerFixture) =>
	new (UltimaBase.use(
		softDeletePlugin(),
		accessPlugin(),
		restPlugin({ acknowledgeUnverifiedProtection: true }),
		graphqlPlugin({ acknowledgeUnverifiedProtection: true }),
		httpPlugin({ appId: 'read-deleted' }),
		capturePlugin,
		postgresPlugin({ pool: database.pool, schemaPolicy: 'override' }),
	))({ logger: false, schemas: [Note] })

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createUltimabase> | undefined
let live = ''
let older = ''
let newer = ''

const current = () => {
	if (ultimabase === undefined || capture.current === undefined) {
		throw new TypeError('readDeleted fixture has not started')
	}
	return { http: capture.current, ultimabase }
}

/** Reads through REST: POST /query with where, orderBy and select. */
const restQuery = async (body: object): Promise<unknown> => {
	const { http } = current()
	const headers = new Headers({ 'content-type': 'application/json' })
	headers.set(httpApplicationIdHeader, 'read-deleted')
	const originalHeaders: HttpOriginalHeader[] = [...headers.entries()]
	const response = await http.fetch({
		originalHeaders,
		request: new Request(
			`https://example.test/api/v1/classes/${Note.className}/query`,
			{ body: JSON.stringify(body), headers, method: 'POST' },
		),
	})
	expect(response.status).toBe(200)
	const payload: unknown = await response.json()
	return payload
}

/** Reads through networkless GraphQL as an anonymous caller. */
const graphqlQuery = async (document: string): Promise<unknown> => {
	const { ultimabase: app } = current()
	const result = await app.plugin('@ultimabase/graphql-plugin').execute({
		context: anonymous(app, {
			requestId: 'read-deleted-graphql',
			source: 'ultimabase.graphql',
		}).context,
		document,
	})
	expect(result.errors).toBeUndefined()
	return result.data
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'read_deleted' })
	ultimabase = createUltimabase(fixture)
	try {
		await ultimabase.start()
	} catch (error: unknown) {
		await fixture.dispose()
		throw error
	}
	live = (await Note.createOne({ data: { title: 'live' } })).id
	older = (await Note.createOne({ data: { title: 'older' } })).id
	newer = (await Note.createOne({ data: { title: 'newer' } })).id
	await Note.deleteOne({ where: { id: older } })
	await Note.deleteOne({ where: { id: newer } })
}, 30_000)

afterAll(async () => {
	try {
		await ultimabase?.dispose()
	} finally {
		await fixture?.dispose()
	}
})

describe('Soft Delete readDeleted through Access (ADR-0317)', () => {
	it('hides deleted rows from callers without the permission', async () => {
		auditing = false
		await expect(Note.findMany({ select: { title: true } })).resolves.toEqual([
			{ id: live, title: 'live' },
		])
		await expect(
			Note.findMany({ where: { isDeleted: { eq: true } } }),
		).resolves.toEqual([])
		await expect(
			restQuery({ where: { isDeleted: { eq: true } } }),
		).resolves.toMatchObject({ results: [] })
		await expect(
			graphqlQuery(`query {
				findManyReadDeletedNote(first: 10, where: { isDeleted: { eq: true } }) {
					nodes { id }
				}
			}`),
		).resolves.toEqual({ findManyReadDeletedNote: { nodes: [] } })
	})

	it('lets holders read, filter and sort deleted rows, REST and GraphQL included', async () => {
		auditing = true
		try {
			await expect(Note.count()).resolves.toBe(3)
			await expect(
				Note.findMany({
					orderBy: { deletedAt: 'desc' },
					select: { title: true },
					where: { isDeleted: { eq: true } },
				}),
			).resolves.toEqual([
				{ id: newer, title: 'newer' },
				{ id: older, title: 'older' },
			])
			await expect(
				restQuery({
					orderBy: { deletedAt: 'asc' },
					select: { title: true },
					where: { isDeleted: { eq: true } },
				}),
			).resolves.toMatchObject({
				results: [
					{ id: older, title: 'older' },
					{ id: newer, title: 'newer' },
				],
			})
			await expect(
				graphqlQuery(`query {
					findManyReadDeletedNote(
						first: 10
						where: { isDeleted: { eq: true } }
						orderBy: [{ field: deletedAt, direction: DESC }]
					) {
						nodes { id isDeleted }
					}
				}`),
			).resolves.toEqual({
				findManyReadDeletedNote: {
					nodes: [
						{ id: newer, isDeleted: true },
						{ id: older, isDeleted: true },
					],
				},
			})
		} finally {
			auditing = false
		}
	})

	it('never lets the permission reach deleted rows through writes', async () => {
		auditing = true
		try {
			await expect(Note.deleteOne({ where: { id: older } })).resolves.toBeNull()
		} finally {
			auditing = false
		}
	})
})
