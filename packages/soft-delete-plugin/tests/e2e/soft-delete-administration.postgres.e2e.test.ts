import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import {
	MasterAuthority,
	UltimaBase,
	type MasterAccessEvent,
} from '@ultimabase/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { anonymous, authorizeMasterKey } from '@ultimabase/core/plugin'

const administrationTrace: string[] = []
const masterAudits: MasterAccessEvent[] = []
let rejectedAdministration: 'purge' | 'restore' | undefined
let rejectMasterAudit = false

const SoftDeleteAdministrationApplication = UltimaBase.use(
	softDeletePlugin(),
	hooksPlugin(),
)

const AdministrationLog = SoftDeleteAdministrationApplication.Schema.define({
	className: 'SoftDeleteAdministrationLog',
	fields: (field) => ({ message: field.string({ required: true }) }),
})

const Document = SoftDeleteAdministrationApplication.Schema.define({
	className: 'SoftDeleteAdministrationDocument',
	fields: (field) => ({
		slug: field.string(),
		title: field.string({ required: true }),
	}),
	indexes: [{ fields: ['slug'], unique: true, where: { isDeleted: false } }],
	softDelete: { mode: 'command' },
}).with({
	hooks: {
		afterOperation: {
			purgeOne: ({ item, originalItem }) => {
				administrationTrace.push(
					`after:purgeOne:${originalItem.title}:${String(item)}`,
				)
			},
			restoreOne: ({ item, originalItem }) => {
				administrationTrace.push(
					`after:restoreOne:${originalItem.title}:${String(item.isDeleted)}`,
				)
			},
		},
		beforeOperation: {
			purgeOne: async ({ context, item, mutation, originalItem }) => {
				administrationTrace.push(
					`before:purgeOne:${mutation.name}:${context.access.mode}:${String(item)}`,
				)
				await AdministrationLog.createOne({
					data: { message: `purge:${originalItem.title}` },
				})
				if (rejectedAdministration === 'purge') {
					throw new Error('administrative purge rejected')
				}
			},
			restoreOne: async ({ context, item, mutation, originalItem }) => {
				administrationTrace.push(
					`before:restoreOne:${mutation.name}:${context.access.mode}:${String(item.isDeleted)}`,
				)
				await AdministrationLog.createOne({
					data: { message: `restore:${originalItem.title}` },
				})
				if (rejectedAdministration === 'restore') {
					throw new Error('administrative restore rejected')
				}
			},
		},
	},
})

const Author = SoftDeleteAdministrationApplication.Schema.define({
	className: 'SoftDeleteAdministrationAuthor',
	fields: (field) => ({ name: field.string({ required: true }) }),
})

const Tag = SoftDeleteAdministrationApplication.Schema.define({
	className: 'SoftDeleteAdministrationTag',
	fields: (field) => ({ label: field.string({ required: true }) }),
})

const Article = SoftDeleteAdministrationApplication.Schema.define({
	className: 'SoftDeleteAdministrationArticle',
	fields: (field) => ({
		author: field.pointer({ target: () => Author }),
		tags: field.relation({ target: () => Tag }),
		title: field.string({ required: true }),
	}),
	softDelete: true,
})

const Plain = SoftDeleteAdministrationApplication.Schema.define({
	className: 'SoftDeleteAdministrationPlain',
	fields: (field) => ({ title: field.string({ required: true }) }),
})

const schemas = [
	AdministrationLog,
	Document,
	Author,
	Tag,
	Article,
	Plain,
] as const

const createApplication = (database: PostgresWorkerFixture) =>
	new (SoftDeleteAdministrationApplication.use(
		postgresPlugin({ pool: database.pool, schemaPolicy: 'override' }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'soft-delete-administration', value: 'administration-key' }],
			onUse: (event) => {
				if (rejectMasterAudit)
					throw new Error('administration audit unavailable')
				masterAudits.push(event)
			},
		}),
		logger: false,
		schemas,
	})

type SoftDeleteAdministrationApplication = ReturnType<typeof createApplication>

let fixture: PostgresWorkerFixture | undefined
let ultimabase: SoftDeleteAdministrationApplication | undefined

const getFixture = () => {
	if (fixture === undefined || ultimabase === undefined) {
		throw new TypeError('Soft-delete administration fixture has not started')
	}
	return { database: fixture, ultimabase }
}

const restoreName = 'ultimabase.soft-delete-plugin.soft-delete.restore-one'
const purgeName = 'ultimabase.soft-delete-plugin.soft-delete.purge-one'

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'soft_delete_admin' })
	const app = createApplication(fixture)
	ultimabase = app
	try {
		await app.start()
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

describe('official soft-delete administration with PostgreSQL', () => {
	it('stamps deletedAt, then restores only a tombstone and clears it', async () => {
		administrationTrace.length = 0
		masterAudits.length = 0
		rejectedAdministration = undefined
		const row = await Document.createOne({ data: { title: 'restore target' } })
		const deleted = await Document.softDeleteOne({
			id: row.id,
			select: { deletedAt: true, isDeleted: true },
		})
		expect(deleted).toMatchObject({ id: row.id, isDeleted: true })
		expect(typeof deleted.deletedAt).toBe('string')

		// Restore is a request command: Access rules it (closed by default when
		// Access is installed); this application has no Access plugin.
		await expect(
			Document.restoreOne({
				id: row.id,
				select: { deletedAt: true, isDeleted: true, title: true },
			}),
		).resolves.toEqual({
			id: row.id,
			deletedAt: null,
			isDeleted: false,
			title: 'restore target',
		})
		expect(masterAudits).toHaveLength(0)
		expect(administrationTrace).toStrictEqual([
			`before:restoreOne:${restoreName}:anonymous:false`,
			'after:restoreOne:restore target:false',
		])
		await expect(
			Document.findOne({ where: { id: { eq: row.id } } }),
		).resolves.toMatchObject({ id: row.id, title: 'restore target' })
		await expect(Document.restoreOne({ id: row.id })).rejects.toMatchObject({
			code: 'NOT_FOUND',
		})
	})

	it('names the command, row and field when a restored value was taken', async () => {
		const first = await Document.createOne({
			data: { slug: 'taken', title: 'first' },
		})
		await Document.softDeleteOne({ id: first.id })
		// The partial index ignores soft-deleted rows, so the slug is free again.
		await Document.createOne({ data: { slug: 'taken', title: 'second' } })

		await expect(Document.restoreOne({ id: first.id })).rejects.toMatchObject({
			code: 'UNIQUE_VIOLATION',
			publicMessage: `Cannot run restoreOne on SoftDeleteAdministrationDocument ${first.id}: slug is now used by another row.`,
			internalDetails: { command: 'restoreOne', values: { slug: 'taken' } },
		})
	})

	it('inherits an existing Master context without a second elevation audit', async () => {
		const { ultimabase: app } = getFixture()
		const row = await Document.createOne({
			data: { title: 'inherited master' },
		})
		await Document.softDeleteOne({ id: row.id })
		masterAudits.length = 0
		const request = anonymous(app, {
			requestId: 'soft-delete-inherited-master',
			source: 'internal',
		})
		const master = await request.useMasterKey(
			authorizeMasterKey(app, 'administration-key'),
			'Trusted maintenance request',
		)
		expect(masterAudits).toHaveLength(1)

		await expect(
			Document.purgeOne({ id: row.id }, { context: master.context }),
		).resolves.toMatchObject({ id: row.id })
		expect(masterAudits).toHaveLength(1)
	})

	it('stops before Hooks and persistence when audit or cancellation rejects', async () => {
		const { database, ultimabase: app } = getFixture()
		administrationTrace.length = 0
		const auditTarget = await Document.createOne({
			data: { title: 'audit failure' },
		})
		await Document.softDeleteOne({ id: auditTarget.id })
		rejectMasterAudit = true
		await expect(
			Document.purgeOne({ id: auditTarget.id }, { useMasterKey: true }),
		).rejects.toThrow('administration audit unavailable')
		rejectMasterAudit = false
		expect(administrationTrace).toStrictEqual([])

		const cancellationTarget = await Document.createOne({
			data: { title: 'cancelled restore' },
		})
		await Document.softDeleteOne({ id: cancellationTarget.id })
		const controller = new AbortController()
		const request = anonymous(app, {
			requestId: 'soft-delete-cancelled-administration',
			signal: controller.signal,
			source: 'internal',
		})
		controller.abort('maintenance cancelled')
		await expect(
			Document.restoreOne(
				{ id: cancellationTarget.id },
				{ context: request.context },
			),
		).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
		expect(administrationTrace).toStrictEqual([])

		const stored = await database.pool.query<{ isDeleted: boolean }>(
			`select is_deleted as "isDeleted"
			 from soft_delete_administration_documents
			 where id = any($1::uuid[])
			 order by id`,
			[[auditTarget.id, cancellationTarget.id]],
		)
		expect(stored.rows).toHaveLength(2)
		expect(stored.rows.every(({ isDeleted }) => isDeleted)).toBe(true)
	})

	it('physically purges only a tombstone and returns its preimage', async () => {
		const { database } = getFixture()
		administrationTrace.length = 0
		masterAudits.length = 0
		const row = await Document.createOne({ data: { title: 'purge target' } })
		await Document.softDeleteOne({ id: row.id })

		await expect(Document.purgeOne({ id: row.id })).rejects.toMatchObject({
			code: 'MASTER_ACCESS_DENIED',
		})
		await expect(
			Document.purgeOne(
				{ id: row.id, select: { isDeleted: true, title: true } },
				{ useMasterKey: true },
			),
		).resolves.toMatchObject({
			id: row.id,
			isDeleted: true,
			title: 'purge target',
		})
		expect(administrationTrace).toStrictEqual([
			`before:purgeOne:${purgeName}:master:null`,
			'after:purgeOne:purge target:null',
		])
		expect(masterAudits[0]?.reason).toBe(
			`Schema mutation ${purgeName} on schema SoftDeleteAdministrationDocument`,
		)
		const stored = await database.pool.query<{ count: number }>(
			`select count(*)::int as count
			 from soft_delete_administration_documents
			 where id = $1`,
			[row.id],
		)
		expect(stored.rows).toStrictEqual([{ count: 0 }])
		await expect(
			Document.purgeOne({ id: row.id }, { useMasterKey: true }),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
	})

	it('restores and purges every matching tombstone with the many-row commands', async () => {
		const rows = await Document.createMany({
			data: [{ title: 'batch a' }, { title: 'batch b' }, { title: 'batch c' }],
		})
		await expect(
			Document.softDeleteMany({
				where: { title: { startsWith: 'batch ' } },
				select: { title: true },
			}),
		).resolves.toHaveLength(3)
		const restored = await Document.restoreMany({
			where: { title: { in: ['batch a', 'batch b'] } },
			select: { deletedAt: true, title: true },
		})
		expect(restored.map(({ title }) => title).sort()).toEqual([
			'batch a',
			'batch b',
		])
		expect(restored.every(({ deletedAt }) => deletedAt === null)).toBe(true)
		// Purge sees hidden rows only: the restored ones stay.
		await expect(
			Document.purgeMany(
				{ where: { title: { startsWith: 'batch ' } }, select: { id: true } },
				{ useMasterKey: true },
			),
		).resolves.toEqual([{ id: rows[2]?.id }])
		await expect(
			Document.count({ where: { title: { startsWith: 'batch ' } } }),
		).resolves.toBe(2)
	})

	it('rolls back the effect and Hook-started work when administration rejects', async () => {
		const { database } = getFixture()
		const restoreTarget = await Document.createOne({
			data: { title: 'rejected restore' },
		})
		await Document.softDeleteOne({ id: restoreTarget.id })
		rejectedAdministration = 'restore'
		await expect(Document.restoreOne({ id: restoreTarget.id })).rejects.toThrow(
			'administrative restore rejected',
		)

		const purgeTarget = await Document.createOne({
			data: { title: 'rejected purge' },
		})
		await Document.softDeleteOne({ id: purgeTarget.id })
		rejectedAdministration = 'purge'
		await expect(
			Document.purgeOne({ id: purgeTarget.id }, { useMasterKey: true }),
		).rejects.toThrow('administrative purge rejected')
		rejectedAdministration = undefined

		const stored = await database.pool.query<{
			id: string
			isDeleted: boolean
		}>(
			`select id, is_deleted as "isDeleted"
			 from soft_delete_administration_documents
			 where id = any($1::uuid[])
			 order by id`,
			[[restoreTarget.id, purgeTarget.id]],
		)
		expect(stored.rows).toHaveLength(2)
		expect(stored.rows.every(({ isDeleted }) => isDeleted)).toBe(true)
		await expect(
			AdministrationLog.findMany({
				where: {
					message: {
						in: ['restore:rejected restore', 'purge:rejected purge'],
					},
				},
			}),
		).resolves.toEqual([])
	})

	it('preserves pointer and relation state through a logical delete and restore', async () => {
		const author = await Author.createOne({ data: { name: 'Ada' } })
		const tag = await Tag.createOne({ data: { label: 'runtime' } })
		const article = await Article.createOne({
			data: {
				author: { connect: Author.pointer(author.id) },
				title: 'recoverable graph',
			},
		})
		await Article.updateOne({
			where: { id: { eq: article.id } },
			data: { tags: { connect: [tag.id] } },
		})
		await Article.deleteOne({ where: { id: article.id } })

		const restored = await Article.restoreOne({
			id: article.id,
			include: { author: {}, tags: {} },
			select: { isDeleted: true, title: true },
		})
		expect(restored).toMatchObject({
			author: { id: author.id, name: 'Ada' },
			id: article.id,
			isDeleted: false,
			tags: [{ id: tag.id, label: 'runtime' }],
			title: 'recoverable graph',
		})
	})

	it('does not expose administration on plain schemas or results', async () => {
		const { ultimabase: app } = getFixture()
		expect(Reflect.has(app.schema(Plain), 'restoreOne')).toBe(false)
		expect(Reflect.has(app.schema(Plain), 'purgeOne')).toBe(false)
		const row = await Document.createOne({ data: { title: 'model surface' } })
		expect(Reflect.has(row, 'restoreOne')).toBe(false)
		expect(Reflect.has(row, 'purgeOne')).toBe(false)
	})
})
