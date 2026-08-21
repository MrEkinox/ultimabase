import { postgresPlugin } from '@ultimabase/postgres-plugin'
import {
	accessPlugin,
	provideAccessContributions,
	schemaAccess,
} from '@ultimabase/access-plugin'
import {
	MasterAuthority,
	Schema,
	UltimaBase,
	definePlugin,
	increment,
} from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const AccessAudit = Schema.define({
	className: 'NativeAccessAudit',
	fields: (field) => ({
		action: field.string({ validation: { required: true } }),
	}),
})

const AccessArticle = Schema.define({
	className: 'NativeAccessArticleE2E',
	fields: (field) => ({
		locked: field.boolean({ default: false }),
		published: field.boolean({ default: false }),
		rank: field.int({ default: 0 }),
		secret: field.string({
			access: {
				read: { orderBy: false, output: false, where: false },
				write: false,
			},
		}),
		title: field.string({
			indexed: 'unique',
			validation: { required: true },
		}),
	}),
	access: {
		read: {
			allow: { count: true, exists: true, many: true, one: true },
			where: ({ where }) => where.eq('published', true).gte('rank', 0),
		},
		create: false,
		update: {
			where: ({ where }) => where.eq('published', true),
			item: ({ originalItem }) => !originalItem.locked,
		},
		delete: {
			allow: true,
			where: ({ where }) => where.eq('published', true),
		},
		upsert: {
			allow: true,
			where: ({ where }) => where.eq('published', true),
		},
	},
	hooks: {
		beforeOperation: {
			update: async ({ operation }) => {
				await AccessAudit.createOne({
					data: { action: `update:${operation.kind}` },
				})
				void operation
			},
		},
	},
})

const BulkDocument = Schema.define({
	className: 'NativeAccessBulkE2E',
	fields: (field) => ({
		key: field.string({ indexed: 'unique', validation: { required: true } }),
		value: field.int({ default: 0 }),
		visible: field.boolean({ default: false }),
	}),
	access: {
		create: false,
		delete: { allow: true, where: ({ where }) => where.eq('visible', true) },
		read: { allow: true, where: ({ where }) => where.eq('visible', true) },
		update: { allow: true, where: ({ where }) => where.eq('visible', true) },
		upsert: { allow: true, where: ({ where }) => where.eq('visible', true) },
	},
})

const pluginVisibility = definePlugin({
	version: '0.0.0',
	core: '^0.0.0',
	pluginId: 'fixture.access-plugin-visibility',
	peers: [{ pluginId: '@ultimabase/access-plugin', version: '^0.0.0' }],
	privileges: [
		{
			name: 'runtime:constrain',
			reason: 'Contributes a monotonic visibility policy for the E2E fixture.',
		},
	],
	capabilities: {
		provides: [
			provideAccessContributions('hide-plugin-rows', () =>
				schemaAccess(AccessArticle, {
					read: {
						where: ({ where }) => where.ne('title', 'plugin-hidden'),
					},
				}),
			),
		],
	},
})

let fixture: PostgresWorkerFixture | undefined
let ultimabase:
	| UltimaBase<
			readonly [typeof AccessArticle, typeof AccessAudit, typeof BulkDocument],
			readonly [typeof pluginVisibility, ReturnType<typeof postgresPlugin>]
	  >
	| undefined
let publicId = ''
let privateId = ''
let lockedId = ''
let visibleDocumentIds: readonly string[] = []

const getUltimaBase = () => {
	if (ultimabase === undefined) {
		throw new TypeError('Native Access PostgreSQL application has not started')
	}

	return ultimabase
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'access-plugin-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		plugins: [
			hooksPlugin(),
			accessPlugin(),
			pluginVisibility,
			postgresPlugin({ schemaPolicy: 'override', url: fixture.connectionUri }),
		],
		schemas: [AccessArticle, AccessAudit, BulkDocument],
		validation: {
			clock: () => new Date('2026-08-03T12:00:00.000Z'),
			timezone: 'UTC',
		},
	})
	await ultimabase.start()

	const articles = await AccessArticle.createMany(
		{
			data: [
				{
					published: true,
					rank: 1,
					secret: 'public-secret',
					title: 'public',
				},
				{
					published: false,
					rank: 2,
					secret: 'private-secret',
					title: 'private',
				},
				{
					published: true,
					rank: 3,
					secret: 'plugin-secret',
					title: 'plugin-hidden',
				},
				{
					locked: true,
					published: true,
					rank: 4,
					secret: 'locked-secret',
					title: 'locked',
				},
			],
		},
		{ ultimabase, useMasterKey: true },
	)
	publicId = articles[0]?.id ?? ''
	privateId = articles[1]?.id ?? ''
	lockedId = articles[3]?.id ?? ''

	const documents = await BulkDocument.createMany(
		{
			data: [
				{ key: 'visible-a', value: 1, visible: true },
				{ key: 'private-a', value: 2, visible: false },
				{ key: 'visible-b', value: 3, visible: true },
			],
		},
		{ ultimabase, useMasterKey: true },
	)
	visibleDocumentIds = documents
		.filter(({ visible }) => visible)
		.map(({ id }) => id)
})

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe('Access plugin with PostgreSQL', () => {
	it('composes native, plugin, and developer predicates in SQL', async () => {
		const app = getUltimaBase()
		const rows = await AccessArticle.findMany(
			{ where: { rank: { gt: 0 } }, orderBy: { rank: 'asc' } },
			{ ultimabase: app },
		)

		expect(rows.map(({ title }) => title)).toStrictEqual(['public', 'locked'])
		await expect(AccessArticle.count({}, { ultimabase: app })).resolves.toBe(2)
		await expect(AccessArticle.exists({}, { ultimabase: app })).resolves.toBe(
			true,
		)
		await expect(
			AccessArticle.findOne(
				{ where: { id: { eq: privateId } } },
				{ ultimabase: app },
			),
		).resolves.toBeNull()
		await expect(
			AccessArticle.exists(
				{ where: { id: { eq: privateId } } },
				{ ultimabase: app },
			),
		).resolves.toBe(false)
		await expect(
			AccessArticle.get({ id: publicId }, { ultimabase: app }),
		).resolves.toMatchObject({ title: 'public' })
	})

	it('omits forbidden output and rejects every indirect field disclosure path', async () => {
		const app = getUltimaBase()
		const article = await AccessArticle.findOne(
			{ where: { id: { eq: publicId } } },
			{ ultimabase: app },
		)

		expect(article).not.toBeNull()
		expect(article).not.toHaveProperty('secret')
		await expect(
			AccessArticle.findMany({ select: { secret: true } }, { ultimabase: app }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			AccessArticle.findMany(
				{ where: { secret: { eq: 'public-secret' } } },
				{ ultimabase: app },
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			AccessArticle.findMany(
				{ orderBy: { secret: 'asc' } },
				{ ultimabase: app },
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			AccessArticle.updateOne(
				{
					where: { id: { eq: publicId } },
					data: { secret: 'changed' },
				},
				{ ultimabase: app },
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
	})

	it('bypasses every Access declaration for audited master', async () => {
		const app = getUltimaBase()

		await expect(
			AccessArticle.createOne(
				{
					data: {
						published: true,
						secret: 'anonymous-secret',
						title: 'anonymous',
					},
				},
				{ ultimabase: app },
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		const masterCreated = await AccessArticle.createOne(
			{
				data: {
					locked: true,
					published: true,
					secret: 'master-secret',
					title: 'master-created',
				},
			},
			{ ultimabase: app, useMasterKey: true },
		)

		expect(masterCreated).toMatchObject({ secret: 'master-secret' })
		await expect(
			AccessArticle.updateOne(
				{
					data: { secret: 'master-updated', title: 'master-updated' },
					where: { id: { eq: masterCreated.id } },
				},
				{ ultimabase: app, useMasterKey: true },
			),
		).resolves.toMatchObject({
			secret: 'master-updated',
			title: 'master-updated',
		})
		await expect(
			AccessArticle.get(
				{ id: privateId },
				{ ultimabase: app, useMasterKey: true },
			),
		).resolves.toMatchObject({ secret: 'private-secret', title: 'private' })
		await expect(
			AccessArticle.exists(
				{ where: { title: { eq: 'plugin-hidden' } } },
				{ ultimabase: app, useMasterKey: true },
			),
		).resolves.toBe(true)
	})

	it('filters mutation targets and rolls nested writes back after item denial', async () => {
		const app = getUltimaBase()
		await expect(
			AccessArticle.deleteOne(
				{ where: { id: { eq: privateId } } },
				{ ultimabase: app },
			),
		).resolves.toBeNull()
		const publicModel = await AccessArticle.findOne(
			{ where: { id: { eq: publicId } } },
			{ ultimabase: app },
		)

		if (publicModel === null) {
			throw new TypeError('Access model-command fixture is missing')
		}

		await expect(
			publicModel.update(
				{ data: { title: 'public-updated' } },
				{ ultimabase: app },
			),
		).resolves.toMatchObject({ title: 'public-updated' })

		const auditCount = await AccessAudit.count({}, { ultimabase: app })
		await expect(
			AccessArticle.updateOne(
				{
					where: { id: { eq: lockedId } },
					data: { title: 'must-rollback' },
				},
				{ ultimabase: app },
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(AccessAudit.count({}, { ultimabase: app })).resolves.toBe(
			auditCount,
		)
		await expect(
			AccessArticle.findOne(
				{ where: { id: { eq: lockedId } } },
				{ ultimabase: app },
			),
		).resolves.toMatchObject({ title: 'locked' })
	})

	it('applies row filters to set-based reads, updates, deletes, and upserts', async () => {
		const app = getUltimaBase()

		await expect(
			BulkDocument.updateMany(
				{
					data: visibleDocumentIds.map((id) => ({
						where: { id: { eq: id } },
						data: { value: increment(10) },
					})),
				},
				{ ultimabase: app },
			),
		).resolves.toHaveLength(2)
		await expect(
			BulkDocument.upsertOne(
				{
					where: { key: { eq: 'visible-a' } },
					create: { key: 'visible-a', value: 0, visible: true },
					update: { value: increment(1) },
				},
				{ ultimabase: app },
			),
		).resolves.toMatchObject({ value: 12 })
		await expect(BulkDocument.count({}, { ultimabase: app })).resolves.toBe(2)
		await expect(
			BulkDocument.deleteMany(
				{ where: visibleDocumentIds.map((id) => ({ id: { eq: id } })) },
				{ ultimabase: app },
			),
		).resolves.toHaveLength(2)
		await expect(BulkDocument.count({}, { ultimabase: app })).resolves.toBe(0)
		await expect(
			BulkDocument.exists(
				{ where: { key: { eq: 'private-a' } } },
				{ ultimabase: app },
			),
		).resolves.toBe(false)
	})
})
