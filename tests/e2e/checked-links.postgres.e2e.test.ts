import { accessPlugin } from '@ultimabase/access-plugin'
import { FrameworkError, MasterAuthority, UltimaBase } from '@ultimabase/core'
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

// ADR-0308: one link vocabulary, and every `connect`, `set` or `disconnect`
// target must be visible; a hidden target is reported like a missing one.
const App = UltimaBase.use(accessPlugin({ allowWithoutRule: { all: true } }))

const Member = App.Schema.define({
	className: 'LinkMember',
	fields: (field) => ({
		name: field.string({ required: true }),
		visible: field.boolean({ default: true }),
	}),
}).with((plugins) => plugins.access({ read: () => ({ visible: true }) }))

const Team = App.Schema.define({
	className: 'LinkTeam',
	fields: (field) => ({
		name: field.string({ required: true }),
		lead: field.pointer({ target: () => Member }),
		owner: field.pointer({ target: () => Member, required: true }),
		members: field.relation({ target: () => Member }),
	}),
})

const httpRequirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})
const capture: { current?: HttpApplication } = {}
const capturePlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.checked-links-capture',
	version: '1.0.0',
	contributions: [
		httpRequirement,
		contributeApplication(({ capabilities }) => {
			capture.current = capabilities.get(httpRequirement)
			return { exports: undefined }
		}),
	],
})

const appId = 'checked-links'
const createApplication = (fixture: PostgresWorkerFixture) =>
	new (App.use(
		restPlugin(),
		graphqlPlugin(),
		httpPlugin({ appId }),
		capturePlugin,
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'checked-links', value: 'checked-links-secret' }],
			onUse: () => undefined,
		}),
		logger: false,
		schemas: [Member, Team],
	})

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined
const application = () => {
	if (ultimabase === undefined) throw new TypeError('Application unavailable')
	return ultimabase
}
const master = { useMasterKey: true } as const
const missingId = '0199c2d0-0000-7000-8000-00000000ffff'

const fetchApplication = (path: string, init: RequestInit) => {
	if (capture.current === undefined) throw new TypeError('HTTP unavailable')
	const headers = new Headers(init.headers)
	headers.set(httpApplicationIdHeader, appId)
	headers.set('content-type', 'application/json')
	const originalHeaders: HttpOriginalHeader[] = [...headers.entries()]
	return capture.current.fetch({
		originalHeaders,
		request: new Request(`https://example.test${path}`, { ...init, headers }),
	})
}

const graphql = (document: string) =>
	application()
		.plugin('@ultimabase/graphql-plugin')
		.execute({
			context: anonymous(application(), {
				requestId: 'checked-links-graphql',
				source: 'ultimabase.graphql',
			}).context,
			document,
		})

/** Reads the public face of a failure, which must not depend on visibility. */
const failure = async (run: () => Promise<unknown>) => {
	const error: unknown = await run().then(
		() => undefined,
		(caught: unknown) => caught,
	)
	if (!(error instanceof FrameworkError)) throw error
	const code: unknown = error.code
	const publicDetails: unknown = error.publicDetails
	return {
		code,
		publicDetails,
		publicMessage: error.publicMessage,
	}
}

const notFound = (field: string) => ({
	code: 'NOT_FOUND',
	publicDetails: { field, schema: 'LinkMember' },
	publicMessage: `The LinkMember linked by ${field} was not found.`,
})

const seed = async () => {
	const [shown, hidden, other] = await Member.createMany(
		{
			data: [
				{ name: 'shown' },
				{ name: 'hidden', visible: false },
				{ name: 'other' },
			],
		},
		master,
	)
	if (shown === undefined || hidden === undefined || other === undefined) {
		throw new TypeError('Seed members are missing')
	}
	return { hidden, other, shown }
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'checked_links' })
	ultimabase = createApplication(fixture)
	await ultimabase.start()
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe(
	'one checked link vocabulary (ADR-0308)',
	{ concurrent: false },
	() => {
		it('links by id or Pointer in hand, unlinks with null and empties with set: []', async () => {
			const { hidden, other, shown } = await seed()
			const team = await Team.createOne({
				data: {
					lead: { connect: shown.id },
					members: { connect: [shown.id, Member.pointer(other.id)] },
					name: 'links',
					owner: { connect: Member.pointer(shown.id) },
				},
			})
			// A Pointer already in hand links like an id.
			const copy = await Team.createOne({
				data: { name: 'copy', owner: { connect: team.owner } },
				select: { owner: true },
			})
			expect(copy.owner.id).toBe(shown.id)

			await Team.updateOne(
				{
					where: { id: team.id },
					data: { members: { connect: [hidden.id] } },
				},
				master,
			)
			const unlinked = await Team.updateOne({
				where: { id: team.id },
				data: { lead: null, members: { set: [] } },
				select: { lead: true },
			})
			expect(unlinked?.lead).toBeNull()
			// `set` keeps the hidden membership (ADR-0243).
			const kept = await Team.findOneOrThrow(
				{ where: { id: team.id }, include: { members: {} } },
				master,
			)
			expect(kept.members.map(({ name }) => name)).toStrictEqual(['hidden'])
		})

		it('rejects every other link form', async () => {
			const { shown } = await seed()

			for (const owner of [Member.pointer(shown.id), shown.id]) {
				const raw = await failure(() =>
					Team.createOne({
						// @ts-expect-error -- A raw Pointer or id is not a link.
						data: { name: 'raw', owner },
					}),
				)
				expect(raw.code).toBe('VALIDATION_ERROR')
				const message = await Team.createOne({
					// @ts-expect-error -- A raw Pointer or id is not a link.
					data: { name: 'raw', owner },
				}).catch((error: unknown) => String(error))
				expect(message).toContain('{ connect: id }')
				await expect(
					// @ts-expect-error -- Collection commands take links too.
					Team.createMany({ data: [{ name: 'raw', owner }] }),
				).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
			}
			const team = await Team.createOne({
				data: { name: 'required', owner: { connect: shown.id } },
			})
			await expect(
				Team.updateOne({
					where: { id: team.id },
					// @ts-expect-error -- A required pointer cannot be unlinked.
					data: { owner: null },
				}),
			).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
			const wrongSchema = await Team.createOne({
				data: {
					name: 'wrong',
					// @ts-expect-error -- A Pointer of another schema is a type error.
					owner: { connect: Team.pointer(team.id) },
				},
			}).catch((error: unknown) => error)
			expect(wrongSchema).toMatchObject({ code: 'VALIDATION_ERROR' })
			expect(String(wrongSchema)).toContain('data.owner.connect')
		})

		it('reports hidden and missing targets alike for connect, set and disconnect', async () => {
			const { hidden, shown } = await seed()
			const team = await Team.createOne({
				data: { name: 'visibility', owner: { connect: shown.id } },
			})
			await Team.updateOne(
				{ where: { id: team.id }, data: { members: { connect: [hidden.id] } } },
				master,
			)
			const link = (data: Parameters<typeof Team.updateOne>[0]['data']) =>
				Team.updateOne({ where: { id: team.id }, data })

			for (const [field, run] of [
				['owner', (id: string) => link({ owner: { connect: id } })],
				['lead', (id: string) => link({ lead: { connect: id } })],
				['members', (id: string) => link({ members: { connect: [id] } })],
				['members', (id: string) => link({ members: { set: [id] } })],
				['members', (id: string) => link({ members: { disconnect: [id] } })],
				[
					'owner',
					(id: string) =>
						Team.createOne({ data: { name: 'new', owner: { connect: id } } }),
				],
			] as const) {
				const hiddenFailure = await failure(() => run(hidden.id))
				const missingFailure = await failure(() => run(missingId))
				expect(hiddenFailure).toStrictEqual(notFound(field))
				expect(missingFailure).toStrictEqual(hiddenFailure)
			}
		})

		it('rolls the whole graph back on a hidden target', async () => {
			const { hidden, shown } = await seed()

			await expect(
				Team.createOne({
					data: {
						members: {
							connect: [hidden.id],
							create: [{ name: 'graph-child' }],
						},
						name: 'graph',
						owner: { connect: shown.id },
					},
				}),
			).rejects.toMatchObject(notFound('members'))
			await expect(
				Team.count({ where: { name: 'graph' } }, master),
			).resolves.toBe(0)
			await expect(
				Member.count({ where: { name: 'graph-child' } }, master),
			).resolves.toBe(0)
		})

		it('checks collection-command links before the write', async () => {
			const { hidden, shown } = await seed()

			await expect(
				Team.createMany({
					data: [
						{ name: 'bulk-a', owner: { connect: shown.id } },
						{ name: 'bulk-b', owner: { connect: hidden.id } },
					],
				}),
			).rejects.toMatchObject(notFound('owner'))
			await expect(
				Team.count({ where: { name: { startsWith: 'bulk-' } } }, master),
			).resolves.toBe(0)
			const [created] = await Team.createMany({
				data: [{ lead: null, name: 'bulk-c', owner: { connect: shown.id } }],
			})
			if (created === undefined) throw new TypeError('Bulk team is missing')
			await expect(
				Team.updateMany({
					data: [
						{
							where: { id: created.id },
							data: { lead: { connect: hidden.id } },
						},
					],
				}),
			).rejects.toMatchObject(notFound('lead'))
			await expect(
				Team.upsertOne({
					where: { id: missingId },
					create: { name: 'upsert', owner: { connect: hidden.id } },
					update: { name: 'upsert' },
				}),
			).rejects.toMatchObject(notFound('owner'))
			await expect(
				Team.upsertOne({
					where: { id: created.id },
					create: { name: 'upsert', owner: { connect: shown.id } },
					update: { lead: { connect: shown.id } },
					select: { lead: true },
				}),
			).resolves.toMatchObject({ lead: Member.pointer(shown.id) })
		})

		it('lets Master link a hidden row but never a missing one', async () => {
			const { hidden } = await seed()

			await expect(
				Team.createOne(
					{ data: { name: 'master', owner: { connect: hidden.id } } },
					master,
				),
			).resolves.toMatchObject({ name: 'master' })
			await expect(
				Team.createOne(
					{ data: { name: 'master', owner: { connect: missingId } } },
					master,
				),
			).rejects.toMatchObject(notFound('owner'))
		})

		it('reports hidden and missing targets alike through REST and GraphQL', async () => {
			const { hidden, shown } = await seed()
			const team = await Team.createOne({
				data: { name: 'transports', owner: { connect: shown.id } },
			})
			await Team.updateOne(
				{ where: { id: team.id }, data: { members: { connect: [hidden.id] } } },
				master,
			)
			const rest = async (data: unknown) => {
				const response = await fetchApplication(
					`/api/classes/LinkTeam/${team.id}`,
					{ body: JSON.stringify(data), method: 'PATCH' },
				)
				const body: unknown = await response.json()
				const error: unknown =
					typeof body === 'object' && body !== null
						? Reflect.get(body, 'error')
						: undefined
				const read = (key: string): unknown =>
					typeof error === 'object' && error !== null
						? Reflect.get(error, key)
						: undefined
				return {
					code: read('code'),
					message: read('message'),
					status: response.status,
				}
			}
			const graph = async (data: string) => {
				const result = await graphql(`
				mutation {
					updateLinkTeam(input: { where: { id: { eq: "${team.id}" } }, data: ${data} }) { id }
				}
			`)
				return {
					extensions: result.errors?.[0]?.extensions,
					message: result.errors?.[0]?.message,
				}
			}

			for (const [restData, graphData] of [
				[
					(id: string) => ({ owner: { connect: id } }),
					(id: string) => `{ owner: { connect: "${id}" } }`,
				],
				[
					(id: string) => ({ members: { set: [id] } }),
					(id: string) => `{ members: { set: ["${id}"] } }`,
				],
				[
					(id: string) => ({ members: { disconnect: [id] } }),
					(id: string) => `{ members: { disconnect: ["${id}"] } }`,
				],
			] as const) {
				const restHidden = await rest(restData(hidden.id))
				expect(restHidden.status).toBe(404)
				expect(await rest(restData(missingId))).toStrictEqual(restHidden)

				const graphHidden = await graph(graphData(hidden.id))
				expect(graphHidden.extensions).toMatchObject({ code: 'NOT_FOUND' })
				const graphMissing = await graph(graphData(missingId))
				expect(graphMissing.message).toBe(graphHidden.message)
				expect(graphMissing.extensions?.code).toBe(graphHidden.extensions?.code)
			}
		})
	},
)
