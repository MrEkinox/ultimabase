import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'
import {
	contributeApplication,
	plugin,
	requireCapability,
} from '@ultimabase/core/plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	httpApplicationCapability,
	httpApplicationIdHeader,
	httpPlugin,
	type HttpApplication,
	type HttpOriginalHeader,
} from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'
import { archivePlugin } from './fixtures/plugin-facade/archive.js'
import { auditPlugin } from './fixtures/plugin-facade/audit.js'
import { healthPlugin } from './fixtures/plugin-facade/health.js'

// The three probe plugins of ADR-0316 written with `definePlugin`, run against
// PostgreSQL; Soft Delete, the fourth, has its own suites.
const audited: string[] = []
const hookTrace: string[] = []
let refusedTitle: string | undefined

const App = UltimaBase.use(
	accessPlugin(),
	hooksPlugin(),
	auditPlugin((line) => audited.push(line)),
	archivePlugin(),
	healthPlugin(),
)

const Post = App.Schema.define({
	className: 'FacadePost',
	fields: (field) => ({
		owner: field.string({ required: true }),
		title: field.string({ required: true }),
	}),
})
	.archivable()
	.with({
		access: {
			read: true,
			create: true,
			delete: true,
			archiveOne: true,
			unarchiveOne: true,
			// Many-row commands keep the one-row rules: a filter narrows the
			// targeted rows, an item rule refuses one row and rolls all back.
			archiveMany: {
				where: () => ({ owner: { eq: 'ada' } }),
				item: ({ originalItem }) => originalItem.title !== 'locked',
			},
		},
		audit: true,
		hooks: {
			beforeOperation: {
				archiveMany: ({ originalItem }) => {
					hookTrace.push(`archiveMany:${originalItem.title}`)
					if (originalItem.title === refusedTitle) {
						throw new TypeError('archive refused by hook')
					}
				},
			},
		},
	})

const Note = App.Schema.define({
	className: 'FacadeNote',
	fields: (field) => ({ body: field.string() }),
}).with({ access: { read: true, create: true } })

// Compile-time proofs (never run): shape fields, commands and rules are typed.
export const typeProofs = (): void => {
	expectTypeOf(Post.archiveOne).parameter(0).toHaveProperty('id')
	expectTypeOf(Post.archiveMany).parameter(0).toHaveProperty('where')
	// @ts-expect-error -- A schema without `.archivable()` has no archive command.
	void Note.archiveOne
	App.Schema.define({
		className: 'FacadeBadRule',
		fields: (field) => ({ title: field.string() }),
	}).with({
		// @ts-expect-error -- `.with` checks the rule value against its validator.
		audit: 'yes',
	})
	// @ts-expect-error -- `archivedAt` is written by the server only.
	void Post.createOne({ data: { owner: 'ada', title: 't', archivedAt: null } })
}

const httpRequirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})
const captured: { http?: HttpApplication } = {}
const capturePlugin = plugin({
	id: 'fixture.plugin-facade-capture',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [
		httpRequirement,
		contributeApplication(({ capabilities }) => {
			captured.http = capabilities.get(httpRequirement)
			return { exports: undefined }
		}),
	],
})

let fixture: PostgresWorkerFixture | undefined
const createApplication = (database: PostgresWorkerFixture) =>
	new (App.use(
		httpPlugin({ appId: 'plugin-facade' }),
		capturePlugin,
		postgresPlugin({ pool: database.pool, schemaPolicy: 'override' }),
	))({ logger: false, schemas: [Post, Note] })
let ultimabase: ReturnType<typeof createApplication> | undefined

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'plugin_facade' })
	ultimabase = createApplication(fixture)
	await ultimabase.start()
}, 30_000)

afterAll(async () => {
	try {
		await ultimabase?.dispose()
	} finally {
		await fixture?.dispose()
	}
})

const titles = async (): Promise<readonly string[]> =>
	(
		await Post.findMany({
			where: { archivedAt: { ne: null } },
			select: { title: true },
		})
	)
		.map(({ title }) => title)
		.sort()

describe('definePlugin probe plugins on PostgreSQL (ADR-0316)', () => {
	it('adds the shape fields and one-row commands', async () => {
		const post = await Post.createOne({
			data: { owner: 'ada', title: 'one' },
		})
		expect(post).toMatchObject({ archivedAt: null })
		const archived = await Post.archiveOne({
			id: post.id,
			select: { archivedAt: true },
		})
		expect(archived.archivedAt).toEqual(expect.any(String))
		await expect(
			Post.unarchiveOne({ id: post.id, select: { archivedAt: true } }),
		).resolves.toEqual({ id: post.id, archivedAt: null })
	})

	it('reports committed writes of schemas whose rule is on', async () => {
		audited.length = 0
		const post = await Post.createOne({ data: { owner: 'ada', title: 'au' } })
		await Note.createOne({ data: { body: 'not audited' } })
		await Post.archiveOne({ id: post.id })
		await Post.findMany()
		expect(audited).toEqual(['FacadePost create-one', 'FacadePost archiveOne'])
	})

	it('writes every row a many-row command may target, in one transaction', async () => {
		hookTrace.length = 0
		refusedTitle = undefined
		await Post.createMany({
			data: [
				{ owner: 'ada', title: 'm-a' },
				{ owner: 'ada', title: 'm-b' },
				{ owner: 'grace', title: 'm-c' },
			],
		})
		const results = await Post.archiveMany({
			where: { title: { startsWith: 'm-' } },
			select: { title: true },
		})
		// The Access filter keeps Grace's row out of the command.
		expect(results.map(({ title }) => title).sort()).toEqual(['m-a', 'm-b'])
		expect(hookTrace.sort()).toEqual(['archiveMany:m-a', 'archiveMany:m-b'])
		await expect(titles()).resolves.toEqual(
			expect.arrayContaining(['m-a', 'm-b']),
		)
		expect(await titles()).not.toContain('m-c')
	})

	it('rolls every row back when one row is refused', async () => {
		await Post.createMany({
			data: [
				{ owner: 'ada', title: 'r-a' },
				{ owner: 'ada', title: 'r-b' },
			],
		})
		refusedTitle = 'r-b'
		await expect(
			Post.archiveMany({ where: { title: { startsWith: 'r-' } } }),
		).rejects.toThrow('archive refused by hook')
		refusedTitle = undefined
		await Post.createOne({ data: { owner: 'ada', title: 'locked' } })
		await expect(
			Post.archiveMany({ where: { title: { in: ['r-a', 'locked'] } } }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		const archived = await titles()
		expect(archived).not.toContain('r-a')
		expect(archived).not.toContain('locked')
	})

	it('serves the route contributed with httpRoutes', async () => {
		const { http } = captured
		if (http === undefined) throw new TypeError('HTTP application missing')
		const headers = new Headers({ [httpApplicationIdHeader]: 'plugin-facade' })
		const originalHeaders: HttpOriginalHeader[] = [...headers.entries()]
		const response = await http.fetch({
			originalHeaders,
			request: new Request('https://example.test/status', { headers }),
		})
		expect(response.status).toBe(200)
		await expect(response.json()).resolves.toEqual({ status: 'ok' })
	})

	it('derives the privileges of each probe from what it declares', () => {
		const privileges = (instance: {
			readonly manifest: {
				readonly privileges: readonly { readonly name: string }[]
			}
		}) => instance.manifest.privileges.map(({ name }) => name)
		expect(privileges(auditPlugin(() => undefined))).toEqual([
			'schema:declare',
			'runtime:intercept',
		])
		expect(privileges(archivePlugin())).toEqual(
			expect.arrayContaining([
				'schema:declare',
				'model:extend',
				'operation:declare',
				'persistence:rewrite',
				
			]),
		)
		expect(privileges(healthPlugin())).toEqual(['transport:expose'])
	})
})
