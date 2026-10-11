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
)
const Explicit = SchemaApplication.Schema.define({
	access: {
		create: true,
		delete: true,
		read: true,
		softDelete: true,
		update: false,
	} as never,
	className: 'SoftDeleteTransportExplicit',
	fields: (field) => ({ title: field.string({ required: true }) }),
	hooks: {
		afterOperation: {
			softDelete: ({
				item,
			}: {
				readonly item: Readonly<Record<string, unknown>>
			}) => {
				explicitSoftDeleteTrace.push(`after:softDelete:${String(item.title)}`)
			},
		},
		beforeOperation: {
			softDelete: ({
				item,
				originalItem,
			}: {
				readonly item: Readonly<Record<string, unknown>>
				readonly originalItem: Readonly<Record<string, unknown>>
			}) => {
				const title = String(originalItem.title)
				explicitSoftDeleteTrace.push(
					`before:softDelete:${title}:${String(item.isDeleted)}`,
				)
				if (title === rejectedSoftDeleteTitle) {
					throw new Error('explicit soft delete rejected')
				}
			},
		},
	} as never,
	softDelete: 'explicit',
})

const Replace = SchemaApplication.Schema.define({
	className: 'SoftDeleteTransportReplace',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: 'replace-delete',
})

const Disabled = SchemaApplication.Schema.define({
	className: 'SoftDeleteTransportDisabled',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: false,
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
		accessPlugin({ default: true }),
		restPlugin({
			acknowledgeUnverifiedProtection: true,
			default: { mutations: true },
		}),
		graphqlPlugin({
			acknowledgeUnverifiedProtection: true,
			default: { mutations: true },
		}),
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
	it('executes its own Access and Hooks identity through schema handles', async () => {
		const { ultimabase: app } = current()
		explicitSoftDeleteTrace.length = 0
		rejectedSoftDeleteTitle = undefined
		const row = await Explicit.createOne({
			data: { title: 'explicit command' },
		})
		const softDelete = Reflect.get(app.schema(Explicit), 'softDelete') as (
			input: unknown,
		) => Promise<Readonly<Record<string, unknown>>>

		await expect(
			softDelete({
				id: row.id,
				select: { isDeleted: true, title: true },
			}),
		).resolves.toMatchObject({
			id: row.id,
			isDeleted: true,
			title: 'explicit command',
		})
		expect(explicitSoftDeleteTrace).toStrictEqual([
			'before:softDelete:explicit command:true',
			'after:softDelete:explicit command',
		])
		await expect(softDelete({ id: row.id })).rejects.toMatchObject({
			code: 'NOT_FOUND',
		})

		// ADR-0310: results have no methods, so no command is bound to a row.
		const bound = await Explicit.createOne({ data: { title: 'bound command' } })
		expect(Reflect.get(bound, 'softDelete')).toBeUndefined()
	})

	it('rolls back when the explicit before hook rejects the command', async () => {
		const { database, ultimabase: app } = current()
		const row = await Explicit.createOne({
			data: { title: 'reject explicit command' },
		})
		rejectedSoftDeleteTitle = 'reject explicit command'
		const softDelete = Reflect.get(app.schema(Explicit), 'softDelete') as (
			input: unknown,
		) => Promise<unknown>

		await expect(softDelete({ id: row.id })).rejects.toThrow(
			'explicit soft delete rejected',
		)
		const stored = await database.pool.query<{ isDeleted: boolean }>(
			`select "isDeleted" from soft_delete_transport_explicits where id = $1`,
			[row.id],
		)
		expect(stored.rows).toStrictEqual([{ isDeleted: false }])
		rejectedSoftDeleteTitle = undefined
		await Explicit.deleteOne({ where: { id: row.id } })
	})

	it('publishes only the explicit REST route and GraphQL field', () => {
		const { ultimabase: app } = current()
		const rest = app.plugin('@ultimabase/rest-plugin')
		const paths = rest.routeGraph.routes
			.filter(({ kind }) => kind === 'rest-schema-mutation-route')
			.map(({ path }) => path)
		expect(paths).toStrictEqual([
			'/api/v1/classes/SoftDeleteTransportExplicit/{id}/soft-delete',
		])
		expect(paths.some((path) => path.endsWith('/restore'))).toBe(false)
		expect(paths.some((path) => path.endsWith('/purge'))).toBe(false)

		const graphql = app.plugin('@ultimabase/graphql-plugin')
		const sdl = graphql.printSchema()
		expect(sdl).toContain(
			'softDeleteSoftDeleteTransportExplicit(input: SoftDeleteSoftDeleteTransportExplicitInput!): SoftDeleteTransportExplicit',
		)
		expect(sdl).toContain(
			'input SoftDeleteSoftDeleteTransportExplicitInput {\n  id: ID!\n}',
		)
		expect(sdl).not.toContain('softDeleteSoftDeleteTransportReplace')
		expect(sdl).not.toContain('softDeleteSoftDeleteTransportDisabled')
		expect(sdl).not.toContain('restoreSoftDeleteTransportExplicit')
		expect(sdl).not.toContain('purgeSoftDeleteTransportExplicit')
	})

	it('executes the same command through REST and networkless GraphQL', async () => {
		const { http, ultimabase: app } = current()
		const restRow = await Explicit.createOne({
			data: { title: 'REST explicit' },
		})
		const response = await fetchApplication(
			http,
			`/api/v1/classes/${Explicit.className}/${restRow.id}/soft-delete`,
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
				softDeleteSoftDeleteTransportExplicit(input: { id: $id }) {
					id isDeleted title
				}
			}`,
			variables: { id: graphqlRow.id },
		})
		expect(result).toMatchObject({
			data: {
				softDeleteSoftDeleteTransportExplicit: {
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
					softDeleteSoftDeleteTransportExplicit(input: { id: $id }) {
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
				softDeleteSoftDeleteTransportExplicit: {
					id: row.id,
					isDeleted: true,
					title: 'Yoga explicit',
				},
			},
		})
	})
})
