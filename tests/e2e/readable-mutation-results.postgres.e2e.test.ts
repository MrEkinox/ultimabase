import { accessPlugin } from '@ultimabase/access-plugin'
import { MasterAuthority, UltimaBase } from '@ultimabase/core'
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
import {
	anonymous,
	contributeApplication,
	plugin,
	requireCapability,
} from '@ultimabase/core/plugin'

// ADR-0306: mutation results obey the row read rules, like PostgreSQL's
// RETURNING under row-level security. Without `select`, a write returns `{ id }`
// and skips the check (ADR-0341), so these calls select more on purpose.
const App = UltimaBase.use(
	softDeletePlugin(),
	accessPlugin({ allowWithoutRule: { all: true } }),
)

const Note = App.Schema.define({
	className: 'ReadableNote',
	fields: (field) => ({
		title: field.string({ required: true }),
		visible: field.boolean({ default: true }),
		parent: field.pointer({ target: () => Note }),
	}),
}).with({ access: { read: ({ where }) => where.eq('visible', true) } })

const Secret = App.Schema.define({
	className: 'ReadableSecret',
	fields: (field) => ({ body: field.string({ required: true }) }),
}).with({ access: { read: false } })

const Archived = App.Schema.define({
	className: 'ReadableArchived',
	fields: (field) => ({
		title: field.string({ required: true }),
		visible: field.boolean({ default: true }),
		secret: field.string({ access: { read: false } }),
	}),
	softDelete: true,
}).with({ access: { read: ({ where }) => where.eq('visible', true) } })

const Explicit = App.Schema.define({
	className: 'ReadableExplicit',
	fields: (field) => ({
		title: field.string({ required: true }),
		visible: field.boolean({ default: true }),
		secret: field.string({ access: { read: false } }),
	}),
	softDelete: { mode: 'command' },
}).with({ access: { read: ({ where }) => where.eq('visible', true) } })

const httpRequirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})
const capture: { current?: HttpApplication } = {}
const capturePlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.readable-results-capture',
	version: '1.0.0',
	contributions: [
		httpRequirement,
		contributeApplication(({ capabilities }) => {
			capture.current = capabilities.get(httpRequirement)
			return { exports: undefined }
		}),
	],
})

const appId = 'readable-results'
const masterKey = 'readable-results-master-secret'
const createApplication = (fixture: PostgresWorkerFixture) =>
	new (App.use(
		restPlugin(),
		graphqlPlugin(),
		httpPlugin({ appId }),
		capturePlugin,
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'readable-results', value: masterKey }],
			onUse: () => undefined,
		}),
		logger: false,
		schemas: [Note, Secret, Archived, Explicit],
	})

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined
const application = () => {
	if (ultimabase === undefined) throw new TypeError('Application unavailable')
	return ultimabase
}
const master = { useMasterKey: true } as const
const unreadable = {
	code: 'PERMISSION_DENIED',
	publicMessage:
		'The ReadableNote result is not readable by the caller: request select: { id: true } or review the ReadableNote read rule.',
}

const title = { title: true } as const

const titles = async (prefix: string): Promise<readonly string[]> =>
	(
		await Note.findMany(
			{ where: { title: { startsWith: prefix } }, select: { title: true } },
			master,
		)
	)
		.map(({ title }) => title)
		.toSorted()

const fetchApplication = (path: string, init: RequestInit) => {
	if (capture.current === undefined) throw new TypeError('HTTP unavailable')
	const headers = new Headers(init.headers)
	headers.set(httpApplicationIdHeader, appId)
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
				requestId: `readable-${String(Math.random())}`,
				source: 'ultimabase.graphql',
			}).context,
			document,
		})

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'readable_results' })
	ultimabase = createApplication(fixture)
	await ultimabase.start()
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe('mutation results obey row read rules (ADR-0306)', () => {
	it('rejects and rolls back an unreadable create, update and upsert', async () => {
		await expect(
			Note.createOne({
				data: { title: 'create-hidden', visible: false },
				select: title,
			}),
		).rejects.toMatchObject(unreadable)
		const visible = await Note.createOne({ data: { title: 'update-visible' } })
		await expect(
			Note.updateOne({
				where: { id: { eq: visible.id } },
				data: { title: 'update-hidden', visible: false },
				select: title,
			}),
		).rejects.toMatchObject(unreadable)
		await expect(
			Note.upsertOne({
				where: { id: { eq: '0199c2d0-0000-7000-8000-0000000000ff' } },
				create: { title: 'upsert-hidden', visible: false },
				update: { title: 'upsert-hidden' },
				select: title,
			}),
		).rejects.toMatchObject(unreadable)

		await expect(titles('create-hidden')).resolves.toStrictEqual([])
		await expect(titles('update-')).resolves.toStrictEqual(['update-visible'])
		await expect(titles('upsert-hidden')).resolves.toStrictEqual([])
	})

	it('always allows select: { id: true }, but not an include', async () => {
		const created = await Note.createOne({
			data: { title: 'id-only', visible: false },
			select: { id: true },
		})
		expect(Object.keys(created)).toStrictEqual(['id'])
		await expect(
			Note.updateOne({
				where: { id: { eq: created.id } },
				data: { title: 'id-only-updated' },
				select: { id: true },
				include: { parent: { select: { id: true } } },
			}),
		).rejects.toMatchObject(unreadable)
		await expect(titles('id-only')).resolves.toStrictEqual(['id-only'])
	})

	it('checks a delete on its locked pre-image', async () => {
		const shown = await Note.createOne({ data: { title: 'delete-shown' } })
		const hidden = await Note.createOne({
			data: { title: 'delete-hidden', visible: false },
			select: { id: true },
		})

		await expect(
			Note.deleteOne({ where: { id: { eq: shown.id } }, select: title }),
		).resolves.toMatchObject({ title: 'delete-shown' })
		await expect(
			Note.deleteOne({ where: { id: { eq: hidden.id } }, select: title }),
		).rejects.toMatchObject(unreadable)
		await expect(titles('delete-hidden')).resolves.toStrictEqual([
			'delete-hidden',
		])
		await expect(
			Note.deleteOne({
				where: { id: { eq: hidden.id } },
				select: { id: true },
			}),
		).resolves.toMatchObject({ id: hidden.id })
	})

	it('keeps collection commands atomic', async () => {
		await expect(
			Note.createMany({
				data: [{ title: 'many-a' }, { title: 'many-b', visible: false }],
				select: title,
			}),
		).rejects.toMatchObject(unreadable)
		await expect(titles('many-')).resolves.toStrictEqual([])

		const [first, second] = await Note.createMany({
			data: [{ title: 'many-c' }, { title: 'many-d' }],
		})
		if (first === undefined || second === undefined) {
			throw new TypeError('Created notes are missing')
		}
		// One unreadable row rejects the whole collection.
		await expect(
			Note.updateMany({
				data: [
					{ where: { id: { eq: first.id } }, data: { title: 'many-c2' } },
					{ where: { id: { eq: second.id } }, data: { visible: false } },
				],
				select: { title: true },
			}),
		).rejects.toMatchObject(unreadable)
		await expect(
			Note.findMany(
				{
					where: { title: { startsWith: 'many-' } },
					select: { visible: true },
				},
				master,
			),
		).resolves.toMatchObject([{ visible: true }, { visible: true }])
		await expect(titles('many-')).resolves.toStrictEqual(['many-c', 'many-d'])
	})

	it('lets Master read back any result', async () => {
		await expect(
			Note.createOne(
				{
					data: { title: 'master-hidden', visible: false },
					select: { title: true, visible: true },
				},
				master,
			),
		).resolves.toMatchObject({ title: 'master-hidden', visible: false })
	})

	it('serves a write-only schema through { id } only', async () => {
		await expect(
			Secret.createOne({
				data: { body: 'write-only' },
				select: { body: true },
			}),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			Secret.createOne({ data: { body: 'write-only' } }),
		).resolves.toStrictEqual({ id: expect.any(String) as unknown })
		await expect(
			Secret.createOne({ data: { body: 'write-only' }, select: { id: true } }),
		).resolves.toHaveProperty('id')
	})

	it('checks Soft Delete deletes on the pre-image and returns the post-image', async () => {
		const shown = await Archived.createOne({
			data: { title: 'archive-shown', secret: 'kept private' },
		})
		const hidden = await Archived.createOne({
			data: { title: 'archive-hidden', visible: false },
			select: { id: true },
		})
		// Readable before: the logical delete answers with the written row,
		// and field rules still mask `secret`.
		// `select: {}` asks for every field the caller may read, like a read.
		const deleted = await Archived.deleteOne({
			where: { id: { eq: shown.id } },
			select: {},
		})
		expect(deleted).toMatchObject({ isDeleted: true, title: 'archive-shown' })
		expect(deleted).not.toHaveProperty('secret')
		// Unreadable before: refused, and nothing is written.
		await expect(
			Archived.deleteOne({ where: { id: { eq: hidden.id } }, select: title }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			Archived.count(
				{ where: { title: { eq: 'archive-hidden' } } },
				{ useMasterKey: true },
			),
		).resolves.toBe(1)

		const softDeleteRow = (id: string): Promise<unknown> =>
			Explicit.softDeleteOne({ id, select: {} })
		const explicit = await Explicit.createOne({
			data: { title: 'explicit', secret: 'kept private' },
		})
		const deletedExplicit = await softDeleteRow(explicit.id)
		expect(deletedExplicit).toMatchObject({
			id: explicit.id,
			isDeleted: true,
			title: 'explicit',
		})
		expect(deletedExplicit).not.toHaveProperty('secret')
		const hiddenExplicit = await Explicit.createOne(
			{ data: { title: 'explicit-hidden', visible: false } },
			{ useMasterKey: true },
		)
		await expect(softDeleteRow(hiddenExplicit.id)).rejects.toMatchObject({
			code: 'PERMISSION_DENIED',
		})
	})

	it('offers id-only selections through REST and GraphQL', async () => {
		const create = (query: string) =>
			fetchApplication(`/api/classes/ReadableSecret${query}`, {
				body: JSON.stringify({ body: 'rest' }),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		const refused = await create('?select=body')
		const accepted = await create('')

		expect(refused.status).toBe(403)
		expect(accepted.status).toBe(201)
		const body: unknown = await accepted.json()
		const result: unknown =
			typeof body === 'object' && body !== null
				? Reflect.get(body, 'result')
				: undefined
		expect(
			typeof result === 'object' && result !== null ? Object.keys(result) : [],
		).toStrictEqual(['id'])

		const idOnly = await graphql(`
			mutation {
				createReadableSecret(input: { body: "graphql" }) {
					id
					__typename
				}
			}
		`)
		const beyondId = await graphql(`
			mutation {
				createReadableSecret(input: { body: "graphql" }) {
					id
					body
				}
			}
		`)

		expect(idOnly.errors).toBeUndefined()
		expect(beyondId.errors?.[0]?.extensions).toMatchObject({
			code: 'PERMISSION_DENIED',
		})
	})
})
