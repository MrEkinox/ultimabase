import { accessPlugin } from '@ultimabase/access-plugin'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
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
import { UltimaBase } from '@ultimabase/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'
import {
	anonymous,
	contributeApplication,
	plugin,
	requireCapability,
} from '@ultimabase/core/plugin'

const explicitSoftDeleteTrace: string[] = []
let rejectedSoftDeleteTitle: string | undefined

const SchemaApplication = UltimaBase.use(
	softDeletePlugin(),
	hooksPlugin(),
	accessPlugin(),
	restPlugin(),
	graphqlPlugin(),
)
const Explicit = SchemaApplication.Schema.define({
	className: 'SoftDeleteTransportExplicit',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: { mode: 'command' },
}).with({
	// ADR-0324, ADR-0325: a transport exposes a plugin command only when
	// its rule names it.
	rest: { restoreOne: true, softDeleteOne: true },
	graphql: { restoreOne: true, softDeleteOne: true },
	access: {
		create: true,
		delete: true,
		read: true,
		softDeleteOne: true,
		update: false,
	},
	hooks: {
		afterOperation: {
			softDeleteOne: ({ item }) => {
				explicitSoftDeleteTrace.push(`after:softDeleteOne:${item.title}`)
			},
		},
		beforeOperation: {
			softDeleteOne: ({ item, originalItem }) => {
				const title = originalItem.title
				explicitSoftDeleteTrace.push(
					`before:softDeleteOne:${title}:${String(item.isDeleted)}`,
				)
				if (title === rejectedSoftDeleteTitle) {
					throw new Error('explicit soft delete rejected')
				}
			},
		},
	},
})

const Replace = SchemaApplication.Schema.define({
	className: 'SoftDeleteTransportReplace',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: true,
}).with({
	graphql: { restoreOne: true, softDeleteOne: true },
	rest: { restoreOne: true, softDeleteOne: true },
})

const Disabled = SchemaApplication.Schema.define({
	className: 'SoftDeleteTransportDisabled',
	fields: (field) => ({ title: field.string({ required: true }) }),
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
	id: 'fixture.soft-delete-transport-capture',
	version: '1.0.0',
})

let fixture: PostgresWorkerFixture | undefined
const schemas = [Explicit, Replace, Disabled] as const

const createUltimabase = (database: PostgresWorkerFixture) =>
	new (UltimaBase.use(
		softDeletePlugin(),
		hooksPlugin(),
		accessPlugin({ allowWithoutRule: { all: true } }),
		restPlugin(),
		graphqlPlugin(),
		graphqlYogaPlugin(),
		httpPlugin({ appId: 'soft-delete-transports' }),
		capturePlugin,
		postgresPlugin({ pool: database.pool, schemaPolicy: 'override' }),
	))({
		logger: false,
		schemas,
	})

let ultimabase: ReturnType<typeof createUltimabase> | undefined

const current = () => {
	if (
		fixture === undefined ||
		ultimabase === undefined ||
		capture.current === undefined
	) {
		throw new TypeError('Soft-delete transport fixture has not started')
	}
	return { database: fixture, http: capture.current, ultimabase }
}

const fetchApplication = (
	http: HttpApplication,
	path: string,
	options: RequestInit,
) => {
	const headers = new Headers(options.headers)
	headers.set(httpApplicationIdHeader, 'soft-delete-transports')
	const originalHeaders: HttpOriginalHeader[] = [...headers.entries()]
	return http.fetch({
		originalHeaders,
		request: new Request(`https://example.test${path}`, {
			...options,
			headers,
		}),
	})
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({
		prefix: 'soft_delete_transport',
	})
	ultimabase = createUltimabase(fixture)
	try {
		await ultimabase.start()
	} catch (error: unknown) {
		await fixture.dispose()
		throw error
	}
}, 30_000)

afterAll(async () => {
	try {
		await ultimabase?.dispose()
	} finally {
		await fixture?.dispose()
	}
})

describe('official explicit soft-delete transports', () => {
	it('executes its own Access and Hooks identity through the schema', async () => {
		explicitSoftDeleteTrace.length = 0
		rejectedSoftDeleteTitle = undefined
		const row = await Explicit.createOne({
			data: { title: 'explicit command' },
		})
		await expect(
			Explicit.softDeleteOne({
				id: row.id,
				select: { isDeleted: true, title: true },
			}),
		).resolves.toMatchObject({
			id: row.id,
			isDeleted: true,
			title: 'explicit command',
		})
		expect(explicitSoftDeleteTrace).toStrictEqual([
			'before:softDeleteOne:explicit command:true',
			'after:softDeleteOne:explicit command',
		])
		await expect(Explicit.softDeleteOne({ id: row.id })).rejects.toMatchObject({
			code: 'NOT_FOUND',
		})

		// ADR-0310: results have no methods, so no command is bound to a row.
		const bound = await Explicit.createOne({ data: { title: 'bound command' } })
		expect(Reflect.get(bound, 'softDeleteOne')).toBeUndefined()
	})

	it('rolls back when the explicit before hook rejects the command', async () => {
		const { database } = current()
		const row = await Explicit.createOne({
			data: { title: 'reject explicit command' },
		})
		rejectedSoftDeleteTitle = 'reject explicit command'

		await expect(Explicit.softDeleteOne({ id: row.id })).rejects.toThrow(
			'explicit soft delete rejected',
		)
		const stored = await database.pool.query<{ isDeleted: boolean }>(
			`select is_deleted as "isDeleted" from soft_delete_transport_explicits where id = $1`,
			[row.id],
		)
		expect(stored.rows).toStrictEqual([{ isDeleted: false }])
		rejectedSoftDeleteTitle = undefined
		await Explicit.deleteOne({ where: { id: row.id } })
	})

	it('publishes the one-row request commands of both modes only', () => {
		const { ultimabase: app } = current()
		const rest = app.plugin('@ultimabase/rest-plugin')
		const paths = rest.routeGraph.routes
			.filter(({ kind }) => kind === 'rest-schema-mutation-route')
			.map(({ path }) => path)
			.sort()
		expect(paths).toStrictEqual([
			'/api/classes/SoftDeleteTransportExplicit/{id}/restore-one',
			'/api/classes/SoftDeleteTransportExplicit/{id}/soft-delete-one',
			'/api/classes/SoftDeleteTransportReplace/{id}/restore-one',
			'/api/classes/SoftDeleteTransportReplace/{id}/soft-delete-one',
		])
		expect(paths.some((path) => path.includes('/purge'))).toBe(false)
		expect(paths.some((path) => path.endsWith('-many'))).toBe(false)

		const graphql = app.plugin('@ultimabase/graphql-plugin')
		const sdl = graphql.printSchema()
		expect(sdl).toContain(
			'softDeleteOneSoftDeleteTransportExplicit(input: SoftDeleteOneSoftDeleteTransportExplicitInput!): SoftDeleteTransportExplicit',
		)
		expect(sdl).toContain(
			'input SoftDeleteOneSoftDeleteTransportExplicitInput {\n  id: ID!\n}',
		)
		expect(sdl).toContain('softDeleteOneSoftDeleteTransportReplace')
		expect(sdl).toContain('restoreOneSoftDeleteTransportExplicit')
		expect(sdl).not.toContain('softDeleteOneSoftDeleteTransportDisabled')
		expect(sdl).not.toContain('restoreOneSoftDeleteTransportDisabled')
		expect(sdl).not.toContain('purgeOneSoftDeleteTransportExplicit')
		expect(sdl).not.toContain('softDeleteManySoftDeleteTransportExplicit')
	})

	it('executes the same command through REST and networkless GraphQL', async () => {
		const { http, ultimabase: app } = current()
		const restRow = await Explicit.createOne({
			data: { title: 'REST explicit' },
		})
		const response = await fetchApplication(
			http,
			`/api/classes/${Explicit.className}/${restRow.id}/soft-delete-one`,
			{
				body: JSON.stringify({ select: { isDeleted: true, title: true } }),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			},
		)
		expect(response.status).toBe(200)
		await expect(response.json()).resolves.toMatchObject({
			result: { id: restRow.id, isDeleted: true, title: 'REST explicit' },
		})

		const graphqlRow = await Explicit.createOne({
			data: { title: 'GraphQL explicit' },
		})
		const graphql = app.plugin('@ultimabase/graphql-plugin')
		const context = anonymous(app, {
			requestId: 'soft-delete-networkless',
			source: 'ultimabase.graphql',
		}).context
		const result = await graphql.execute({
			context,
			document: `mutation SoftDelete($id: ID!) {
				softDeleteOneSoftDeleteTransportExplicit(input: { id: $id }) {
					id isDeleted title
				}
			}`,
			variables: { id: graphqlRow.id },
		})
		expect(result).toMatchObject({
			data: {
				softDeleteOneSoftDeleteTransportExplicit: {
					id: graphqlRow.id,
					isDeleted: true,
					title: 'GraphQL explicit',
				},
			},
		})
	})

	it('executes the generated mutation through Yoga without another handler', async () => {
		const { http } = current()
		const row = await Explicit.createOne({ data: { title: 'Yoga explicit' } })
		const response = await fetchApplication(http, '/graphql', {
			body: JSON.stringify({
				query: `mutation SoftDelete($id: ID!) {
					softDeleteOneSoftDeleteTransportExplicit(input: { id: $id }) {
						id isDeleted title
					}
				}`,
				variables: { id: row.id },
			}),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		})
		expect(response.status).toBe(200)
		await expect(response.json()).resolves.toMatchObject({
			data: {
				softDeleteOneSoftDeleteTransportExplicit: {
					id: row.id,
					isDeleted: true,
					title: 'Yoga explicit',
				},
			},
		})
	})
})
