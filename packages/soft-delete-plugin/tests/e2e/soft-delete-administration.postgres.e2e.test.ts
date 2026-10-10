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

interface AdministrationHookInput {
	readonly context: Readonly<{
		readonly access: Readonly<{ readonly mode: string }>
	}>
	readonly item: Readonly<Record<string, unknown>> | null
	readonly mutation: Readonly<{ readonly name: string }>
	readonly originalItem: Readonly<Record<string, unknown>>
}

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
	fields: (field) => ({ title: field.string({ required: true }) }),
	hooks: {
		afterOperation: {
			purge: ({ item, originalItem }: AdministrationHookInput) => {
				administrationTrace.push(
					`after:purge:${String(originalItem.title)}:${item === null ? 'null' : 'record'}`,
				)
			},
			restore: ({ item, originalItem }: AdministrationHookInput) => {
				administrationTrace.push(
					`after:restore:${String(originalItem.title)}:${String(item?.isDeleted)}`,
				)
			},
		},
		beforeOperation: {
			purge: async ({
				context,
				item,
				mutation,
				originalItem,
			}: AdministrationHookInput) => {
				administrationTrace.push(
					`before:purge:${mutation.name}:${context.access.mode}:${item === null ? 'null' : 'record'}`,
				)
				await AdministrationLog.createOne({
					data: { message: `purge:${String(originalItem.title)}` },
				})
				if (rejectedAdministration === 'purge') {
					throw new Error('administrative purge rejected')
				}
			},
			restore: async ({
				context,
				item,
				mutation,
				originalItem,
			}: AdministrationHookInput) => {
				administrationTrace.push(
					`before:restore:${mutation.name}:${context.access.mode}:${String(item?.isDeleted)}`,
				)
				await AdministrationLog.createOne({
					data: { message: `restore:${String(originalItem.title)}` },
				})
				if (rejectedAdministration === 'restore') {
					throw new Error('administrative restore rejected')
				}
			},
		},
	} as never,
	softDelete: 'explicit',
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
		author: field.pointer({ target: 'SoftDeleteAdministrationAuthor' }),
		tags: field.relation({ target: 'SoftDeleteAdministrationTag' }),
		title: field.string({ required: true }),
	}),
	softDelete: 'replace-delete',
})

const Disabled = SoftDeleteAdministrationApplication.Schema.define({
	className: 'SoftDeleteAdministrationDisabled',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: false,
})

const schemas = [
	AdministrationLog,
	Document,
	Author,
	Tag,
	Article,
	Disabled,
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
		pluginPrivileges: { logger: false },
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

const schemaCommand = (
	app: SoftDeleteAdministrationApplication,
	schema: typeof Document | typeof Article,
	command: 'purge' | 'restore' | 'softDelete',
): ((
	input: unknown,
	options?: unknown,
) => Promise<Readonly<Record<string, unknown>>>) =>
	Reflect.get(app.schema(schema), command) as (
		input: unknown,
		options?: unknown,
	) => Promise<Readonly<Record<string, unknown>>>

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
	it('requires Master before target lookup and restores only a tombstone', async () => {
		const { ultimabase: app } = getFixture()
		administrationTrace.length = 0
		masterAudits.length = 0
		rejectedAdministration = undefined
		const row = await Document.createOne({ data: { title: 'restore target' } })
		const softDelete = schemaCommand(app, Document, 'softDelete')
		const restore = schemaCommand(app, Document, 'restore')
		await softDelete({ id: row.id })

		await expect(restore({ id: row.id })).rejects.toMatchObject({
			code: 'MASTER_ACCESS_DENIED',
		})
		expect(administrationTrace).toStrictEqual([])
		await expect(
			restore(
				{ id: row.id, select: { isDeleted: true, title: true } },
				{ useMasterKey: true },
			),
		).resolves.toMatchObject({
			id: row.id,
			isDeleted: false,
			title: 'restore target',
		})
		expect(masterAudits).toHaveLength(1)
		expect(masterAudits[0]?.reason).toBe(
			'Schema mutation ultimabase.soft-delete.restore on schema SoftDeleteAdministrationDocument',
		)
		expect(administrationTrace).toStrictEqual([
			'before:restore:ultimabase.soft-delete.restore:master:false',
			'after:restore:restore target:false',
		])
		await expect(
			Document.findOne({ where: { id: { eq: row.id } } }),
		).resolves.toMatchObject({ id: row.id, title: 'restore target' })
		await expect(
			restore({ id: row.id }, { useMasterKey: true }),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
	})

	it('inherits an existing Master context without a second elevation audit', async () => {
		const { ultimabase: app } = getFixture()
		const row = await Document.createOne({
			data: { title: 'inherited master' },
		})
		await schemaCommand(app, Document, 'softDelete')({ id: row.id })
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
			schemaCommand(
				app,
				Document,
				'restore',
			)({ id: row.id }, { context: master.context }),
		).resolves.toMatchObject({ id: row.id })
		expect(masterAudits).toHaveLength(1)
	})

	it('stops before Hooks and persistence when audit or cancellation rejects', async () => {
		const { database, ultimabase: app } = getFixture()
		administrationTrace.length = 0
		const auditTarget = await Document.createOne({
			data: { title: 'audit failure' },
		})
		await schemaCommand(app, Document, 'softDelete')({ id: auditTarget.id })
		rejectMasterAudit = true
		await expect(
			schemaCommand(
				app,
				Document,
				'restore',
			)({ id: auditTarget.id }, { useMasterKey: true }),
		).rejects.toThrow('administration audit unavailable')
		rejectMasterAudit = false
		expect(administrationTrace).toStrictEqual([])

		const cancellationTarget = await Document.createOne({
			data: { title: 'cancelled restore' },
		})
		await schemaCommand(
			app,
			Document,
			'softDelete',
		)({
			id: cancellationTarget.id,
		})
		const controller = new AbortController()
		const request = anonymous(app, {
			requestId: 'soft-delete-cancelled-administration',
			signal: controller.signal,
			source: 'internal',
		})
		const master = await request.useMasterKey(
			authorizeMasterKey(app, 'administration-key'),
			'Trusted cancellable maintenance request',
		)
		controller.abort('maintenance cancelled')
		await expect(
			schemaCommand(
				app,
				Document,
				'restore',
			)({ id: cancellationTarget.id }, { context: master.context }),
		).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
		expect(administrationTrace).toStrictEqual([])

		const stored = await database.pool.query<{ isDeleted: boolean }>(
			`select "isDeleted"
			 from soft_delete_administration_documents
			 where id = any($1::uuid[])
			 order by id`,
			[[auditTarget.id, cancellationTarget.id]],
		)
		expect(stored.rows).toHaveLength(2)
		expect(stored.rows.every(({ isDeleted }) => isDeleted)).toBe(true)
	})

	it('physically purges only a tombstone and returns its preimage', async () => {
		const { database, ultimabase: app } = getFixture()
		administrationTrace.length = 0
		masterAudits.length = 0
		const row = await Document.createOne({ data: { title: 'purge target' } })
		await schemaCommand(app, Document, 'softDelete')({ id: row.id })
		const purge = schemaCommand(app, Document, 'purge')

		await expect(
			purge(
				{ id: row.id, select: { isDeleted: true, title: true } },
				{ useMasterKey: true },
			),
		).resolves.toMatchObject({
			id: row.id,
			isDeleted: true,
			title: 'purge target',
		})
		expect(administrationTrace).toStrictEqual([
			'before:purge:ultimabase.soft-delete.purge:master:null',
			'after:purge:purge target:null',
		])
		expect(masterAudits[0]?.reason).toBe(
			'Schema mutation ultimabase.soft-delete.purge on schema SoftDeleteAdministrationDocument',
		)
		const stored = await database.pool.query<{ count: number }>(
			`select count(*)::int as count
			 from soft_delete_administration_documents
			 where id = $1`,
			[row.id],
		)
		expect(stored.rows).toStrictEqual([{ count: 0 }])
		await expect(
			purge({ id: row.id }, { useMasterKey: true }),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
	})

	it('rolls back the effect and Hook-started work when administration rejects', async () => {
		const { database, ultimabase: app } = getFixture()
		const restoreTarget = await Document.createOne({
			data: { title: 'rejected restore' },
		})
		await schemaCommand(app, Document, 'softDelete')({ id: restoreTarget.id })
		rejectedAdministration = 'restore'
		await expect(
			schemaCommand(
				app,
				Document,
				'restore',
			)({ id: restoreTarget.id }, { useMasterKey: true }),
		).rejects.toThrow('administrative restore rejected')

		const purgeTarget = await Document.createOne({
			data: { title: 'rejected purge' },
		})
		await schemaCommand(app, Document, 'softDelete')({ id: purgeTarget.id })
		rejectedAdministration = 'purge'
		await expect(
			schemaCommand(
				app,
				Document,
				'purge',
			)({ id: purgeTarget.id }, { useMasterKey: true }),
		).rejects.toThrow('administrative purge rejected')
		rejectedAdministration = undefined

		const stored = await database.pool.query<{
			id: string
			isDeleted: boolean
		}>(
			`select id, "isDeleted"
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

	it('preserves pointer and relation state through replace-delete restore', async () => {
		const { ultimabase: app } = getFixture()
		const author = await Author.createOne({ data: { name: 'Ada' } })
		const tag = await Tag.createOne({ data: { label: 'runtime' } })
		const article = await Article.createOne({
			data: {
				// The fixture has no generated named-schema graph for this pointer.
				author: { connect: Author.pointer(author.id) },
				title: 'recoverable graph',
			},
		})
		await Article.updateOne({
			where: { id: { eq: article.id } },
			data: { tags: { connect: [tag.id] } },
		})
		await Article.deleteOne({ where: { id: article.id } })

		const restored = await schemaCommand(
			app,
			Article,
			'restore',
		)(
			{
				id: article.id,
				include: { author: {}, tags: {} },
				select: { isDeleted: true, title: true },
			},
			{ useMasterKey: true },
		)
		expect(restored).toMatchObject({
			author: { id: author.id, name: 'Ada' },
			id: article.id,
			isDeleted: false,
			tags: [{ id: tag.id, label: 'runtime' }],
			title: 'recoverable graph',
		})
	})

	it('does not expose administration on disabled schemas or model handles', async () => {
		const { ultimabase: app } = getFixture()
		expect(Reflect.has(app.schema(Disabled), 'restore')).toBe(false)
		expect(Reflect.has(app.schema(Disabled), 'purge')).toBe(false)
		const row = await Document.createOne({ data: { title: 'model surface' } })
		expect(Reflect.has(row, 'restore')).toBe(false)
		expect(Reflect.has(row, 'purge')).toBe(false)
	})
})
