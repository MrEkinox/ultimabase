import { postgresPlugin } from '@ultimabase/postgres-plugin'
import {
	MasterAuthority,
	Schema,
	UltimaBase,
	booleanField,
	definePlugin,
	intField,
	stringField,
} from '@ultimabase/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const AccessAudit = Schema.define({
	className: 'NativeAccessAudit',
	fields: {
		action: stringField({ validation: { required: true } }),
	},
})

const AccessArticle = Schema.define({
	className: 'NativeAccessArticleE2E',
	access: {
		filter: {
			delete: ({ filter }) => filter.equalTo('published', true),
			read: ({ filter }) => filter.equalTo('published', true),
			update: ({ filter }) => filter.equalTo('published', true),
			upsert: ({ filter }) => filter.equalTo('published', true),
		},
		item: {
			update: ({ item }) => !item.locked,
		},
		operation: {
			create: ({ context }) => context.access.mode === 'master',
			delete: true,
			read: { count: true, exists: true, many: true, one: true },
			update: true,
			upsert: true,
		},
	},
	fields: {
		locked: booleanField({ default: false }),
		published: booleanField({ default: false }),
		rank: intField({ default: 0 }),
		secret: stringField({
			access: {
				create: ({ context }) => context.access.mode === 'master',
				read: { filter: false, item: false, order: false },
				update: false,
			},
		}),
		title: stringField({
			indexed: 'unique',
			validation: { required: true },
		}),
	},
	hooks: {
		beforeFind: ({ query }) => query.greaterThanOrEqualTo('rank', 0),
		beforeUpdate: async ({ operation }) => {
			await AccessAudit.create({ action: `update:${operation.kind}` })

			return operation
		},
	},
})

const BulkDocument = Schema.define({
	className: 'NativeAccessBulkE2E',
	access: {
		filter: {
			delete: ({ filter }) => filter.equalTo('visible', true),
			read: ({ filter }) => filter.equalTo('visible', true),
			update: ({ filter }) => filter.equalTo('visible', true),
			upsert: ({ filter }) => filter.equalTo('visible', true),
		},
		operation: {
			create: ({ context }) => context.access.mode === 'master',
			delete: true,
			read: true,
			update: true,
			upsert: true,
		},
	},
	fields: {
		key: stringField({ indexed: 'unique', validation: { required: true } }),
		value: intField({ default: 0 }),
		visible: booleanField({ default: false }),
	},
})

const pluginVisibility = definePlugin({
	name: 'fixture.native-access-visibility',
	setup: ({ access }) => {
		access.schema(
			'hide-plugin-rows',
			AccessArticle,
			{
				filter: {
					read: ({ filter }) => filter.notEqualTo('title', 'plugin-hidden'),
				},
			},
			{ master: 'enforce' },
		)
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
			keys: [{ id: 'native-access-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		plugins: [
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
		[
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
		{ ultimabase, useMasterKey: true },
	)
	publicId = articles[0]?.id ?? ''
	privateId = articles[1]?.id ?? ''
	lockedId = articles[3]?.id ?? ''

	await BulkDocument.createMany(
		[
			{ key: 'visible-a', value: 1, visible: true },
			{ key: 'private-a', value: 2, visible: false },
			{ key: 'visible-b', value: 3, visible: true },
		],
		{ ultimabase, useMasterKey: true },
	)
})

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe('native Access with PostgreSQL', () => {
	it('composes native, plugin, developer, and beforeFind predicates in SQL', async () => {
		const app = getUltimaBase()
		const rows = await AccessArticle.query()
			.greaterThan('rank', 0)
			.ascending('rank')
			.find({ ultimabase: app })

		expect(rows.map(({ title }) => title)).toStrictEqual(['public', 'locked'])
		await expect(
			AccessArticle.query().count({ ultimabase: app }),
		).resolves.toBe(2)
		await expect(
			AccessArticle.query().exists({ ultimabase: app }),
		).resolves.toBe(true)
		await expect(
			AccessArticle.query().byId(privateId).first({ ultimabase: app }),
		).resolves.toBeNull()
		await expect(
			AccessArticle.query().byId(privateId).exists({ ultimabase: app }),
		).resolves.toBe(false)
		await expect(
			AccessArticle.query().byId(publicId).get(publicId, { ultimabase: app }),
		).resolves.toMatchObject({ title: 'public' })
	})

	it('omits forbidden output and rejects every indirect field disclosure path', async () => {
		const app = getUltimaBase()
		const article = await AccessArticle.query()
			.byId(publicId)
			.first({ ultimabase: app })

		expect(article).not.toBeNull()
		expect(article).not.toHaveProperty('secret')
		await expect(
			AccessArticle.query().select('secret').find({ ultimabase: app }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			AccessArticle.query()
				.equalTo('secret', 'public-secret')
				.find({ ultimabase: app }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			AccessArticle.query().ascending('secret').find({ ultimabase: app }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			AccessArticle.updateOne(
				{
					where: (where) => where.equalTo('id', publicId),
					data: { set: { secret: 'changed' } },
				},
				{ ultimabase: app },
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
	})

	it('keeps audited master behavior explicit per native and plugin contribution', async () => {
		const app = getUltimaBase()

		await expect(
			AccessArticle.create(
				{ published: true, secret: 'anonymous-secret', title: 'anonymous' },
				{ ultimabase: app },
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		const masterCreated = await AccessArticle.create(
			{
				published: true,
				secret: 'master-secret',
				title: 'master-created',
			},
			{ ultimabase: app, useMasterKey: true },
		)

		expect(masterCreated).not.toHaveProperty('secret')
		await expect(
			AccessArticle.query()
				.equalTo('title', 'plugin-hidden')
				.exists({ ultimabase: app, useMasterKey: true }),
		).resolves.toBe(false)
	})

	it('filters mutation targets and rolls nested writes back after item denial', async () => {
		const app = getUltimaBase()
		await expect(
			AccessArticle.deleteOne(
				{ where: (where) => where.equalTo('id', privateId) },
				{ ultimabase: app },
			),
		).resolves.toBeNull()
		const publicModel = await AccessArticle.query()
			.byId(publicId)
			.first({ ultimabase: app })

		if (publicModel === null) {
			throw new TypeError('Access model-command fixture is missing')
		}

		await expect(
			publicModel.update(
				{ set: { title: 'public-updated' } },
				{ ultimabase: app },
			),
		).resolves.toMatchObject({ title: 'public-updated' })

		const auditCount = await AccessAudit.query().count({ ultimabase: app })
		await expect(
			AccessArticle.updateOne(
				{
					where: (where) => where.equalTo('id', lockedId),
					data: { set: { title: 'must-rollback' } },
				},
				{ ultimabase: app },
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(AccessAudit.query().count({ ultimabase: app })).resolves.toBe(
			auditCount,
		)
		await expect(
			AccessArticle.query().byId(lockedId).first({ ultimabase: app }),
		).resolves.toMatchObject({ title: 'locked' })
	})

	it('applies row filters to set-based reads, updates, deletes, and upserts', async () => {
		const app = getUltimaBase()

		await expect(
			BulkDocument.updateMany(
				{ where: 'all', data: { increment: { value: 10 } } },
				{ ultimabase: app },
			),
		).resolves.toBe(2)
		await expect(
			BulkDocument.upsert(
				{
					where: (where) => where.equalTo('key', 'visible-a'),
					create: { key: 'visible-a', value: 0, visible: true },
					update: { increment: { value: 1 } },
				},
				{ ultimabase: app },
			),
		).resolves.toMatchObject({ value: 12 })
		await expect(BulkDocument.query().count({ ultimabase: app })).resolves.toBe(
			2,
		)
		await expect(
			BulkDocument.deleteMany({ where: 'all' }, { ultimabase: app }),
		).resolves.toBe(2)
		await expect(BulkDocument.query().count({ ultimabase: app })).resolves.toBe(
			0,
		)
		await expect(
			BulkDocument.query()
				.equalTo('key', 'private-a')
				.exists({ ultimabase: app }),
		).resolves.toBe(false)
	})
})
