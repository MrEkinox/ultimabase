import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	getOperationSchema,
	MasterAuthority,
	UltimaBase,
	plugin,
	preparedOperation,
	provideRuntimeBehavior,
	provideRuntimeInterceptor,
} from '@ultimabase/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

const SoftDeleteSchemaApplication = UltimaBase.use(accessPlugin())
	.use(hooksPlugin())
	.use(softDeletePlugin())

const VisibleRecord = SoftDeleteSchemaApplication.Schema.define({
	className: 'SoftDeleteVisibleRecord',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: 'explicit',
})

const PlainRecord = SoftDeleteSchemaApplication.Schema.define({
	className: 'SoftDeletePlainRecord',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: false,
})

const replaceDeleteTrace: string[] = []
let rejectedDeleteTitle: string | undefined

const ReplaceRecord = SoftDeleteSchemaApplication.Schema.define({
	access: {
		create: true,
		delete: true,
		read: true,
		update: false,
	},
	className: 'SoftDeleteReplaceRecord',
	fields: (field) => ({ title: field.string({ required: true }) }),
	hooks: {
		afterOperation: {
			delete: ({ originalItem }) => {
				replaceDeleteTrace.push(`after:delete:${String(originalItem.title)}`)
			},
			update: () => {
				replaceDeleteTrace.push('after:update')
			},
		},
		beforeOperation: {
			delete: ({ originalItem }) => {
				const title = String(originalItem.title)
				replaceDeleteTrace.push(`before:delete:${title}`)
				if (title === rejectedDeleteTitle) {
					throw new Error('replace-delete batch rejected')
				}
			},
			update: () => {
				replaceDeleteTrace.push('before:update')
			},
		},
	},
	softDelete: 'replace-delete',
})

const replaceDeleteObserver = plugin({
	core: '^0.0.0',
	id: 'fixture.soft-delete-logical-observer',
	permissions: {
		'runtime:intercept':
			'Proves post-commit observers retain logical delete identity.',
	},
	version: '1.0.0',
	contributions: [
		provideRuntimeBehavior({
			contributionId: 'replace-delete-logical-observer',
			create: () => ({
				value: {
					postCommit: ({ operation }) => {
						if (
							(operation.kind === 'delete-one' ||
								operation.kind === 'update-one') &&
							getOperationSchema(operation) === ReplaceRecord
						) {
							replaceDeleteTrace.push(`committed:${operation.kind}`)
						}
					},
				},
			}),
		}),
	],
})

const staleTombstoneWriter = plugin({
	core: '^0.0.0',
	id: 'fixture.soft-delete-stale-tombstone-writer',
	permissions: {
		'runtime:intercept':
			'Proves final structural validation protects plugin-owned fields.',
	},
	version: '1.0.0',
	contributions: [
		provideRuntimeInterceptor({
			contributionId: 'stale-tombstone-write',
			create: () => ({
				value: preparedOperation({
					schema: VisibleRecord,
					handler: ({ operation }) => {
						// This deliberately malicious plugin crosses the typed AST boundary so
						// final structural validation can prove the write is rejected.
						const staleOperation: unknown = {
							...operation,
							update: {
								...operation.update,
								operations: [
									...operation.update.operations,
									{
										field: 'isDeleted',
										kind: 'set',
										value: true,
									},
								],
							},
						}

						return { operation: staleOperation as typeof operation }
					},
				}),
			}),
		}),
	],
})

const Author = SoftDeleteSchemaApplication.Schema.define({
	className: 'SoftDeleteVisibilityAuthor',
	fields: (field) => ({ name: field.string({ required: true }) }),
	softDelete: 'explicit',
})

const Tag = SoftDeleteSchemaApplication.Schema.define({
	className: 'SoftDeleteVisibilityTag',
	fields: (field) => ({ label: field.string({ required: true }) }),
	softDelete: 'explicit',
})

const Article = SoftDeleteSchemaApplication.Schema.define({
	className: 'SoftDeleteVisibilityArticle',
	fields: (field) => ({
		author: field.pointer({ target: 'SoftDeleteVisibilityAuthor' }),
		tags: field.relation({ target: 'SoftDeleteVisibilityTag' }),
		title: field.string({ required: true }),
	}),
	softDelete: 'explicit',
})

const schemas = [
	VisibleRecord,
	PlainRecord,
	ReplaceRecord,
	Author,
	Tag,
	Article,
] as const
type SoftDeleteApplication = UltimaBase<
	typeof schemas,
	readonly [
		ReturnType<typeof softDeletePlugin>,
		ReturnType<typeof hooksPlugin>,
		ReturnType<typeof accessPlugin>,
		typeof staleTombstoneWriter,
		typeof replaceDeleteObserver,
		ReturnType<typeof postgresPlugin>,
	]
>
let fixture: PostgresWorkerFixture | undefined
let ultimabase: SoftDeleteApplication | undefined

const getFixture = (): Readonly<{
	readonly database: PostgresWorkerFixture
	readonly ultimabase: SoftDeleteApplication
}> => {
	if (fixture === undefined || ultimabase === undefined) {
		throw new TypeError('Soft-delete PostgreSQL fixture has not started')
	}
	return { database: fixture, ultimabase }
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'soft_delete' })
	ultimabase = new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'soft-delete-e2e-master', value: 'unused' }],
			onUse: () => undefined,
		}),
		pluginPrivileges: { logger: false },
		plugins: [
			softDeletePlugin(),
			hooksPlugin(),
			accessPlugin({ default: true }),
			staleTombstoneWriter,
			replaceDeleteObserver,
			postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
		],
		schemas,
	})

	try {
		await ultimabase.start()
	} catch (error: unknown) {
		await fixture.dispose()
		throw new Error(
			error instanceof Error ? error.message : JSON.stringify(error),
			{ cause: error },
		)
	}
}, 30_000)

afterAll(async () => {
	try {
		await ultimabase?.dispose()
	} finally {
		await fixture?.dispose()
	}
})

describe('official soft-delete visibility with PostgreSQL', () => {
	it('persists the owned boolean only for enabled schemas', async () => {
		const { database } = getFixture()
		const columns = await database.pool.query<{
			column_default: string | null
			column_name: string
			is_nullable: string
		}>(
			`select column_name, column_default, is_nullable
			 from information_schema.columns
			 where table_schema = $1
			   and table_name in ('soft_delete_visible_records', 'soft_delete_plain_records')
			   and column_name = 'isDeleted'`,
			[database.schemaName],
		)

		expect(columns.rows).toEqual([
			expect.objectContaining({
				column_default: 'false',
				column_name: 'isDeleted',
				is_nullable: 'NO',
			}),
		])
	})

	it('rejects caller tombstones and filters every ordinary read including Master', async () => {
		const { database, ultimabase: app } = getFixture()
		const createUntrustedVisibleRecord = VisibleRecord.createOne.bind(
			VisibleRecord,
		) as unknown as (
			input: unknown,
			options: Readonly<{ ultimabase: typeof app }>,
		) => Promise<unknown>

		await expect(
			createUntrustedVisibleRecord(
				{ data: { isDeleted: true, title: 'forbidden' } },
				{ ultimabase: app },
			),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })

		const active = await VisibleRecord.createOne(
			{ data: { title: 'active' }, select: { isDeleted: true, title: true } },
			{ ultimabase: app },
		)
		expect(active.toJSON()).toMatchObject({ isDeleted: false, title: 'active' })

		await database.pool.query(
			`update soft_delete_visible_records set "isDeleted" = true where id = $1`,
			[active.id],
		)

		await expect(
			VisibleRecord.findMany(undefined, { ultimabase: app }),
		).resolves.toEqual([])
		await expect(
			VisibleRecord.count(undefined, { ultimabase: app }),
		).resolves.toBe(0)
		await expect(
			VisibleRecord.exists(
				{ where: { id: { eq: active.id } } },
				{ ultimabase: app },
			),
		).resolves.toBe(false)
		await expect(
			VisibleRecord.findMany(undefined, {
				ultimabase: app,
				useMasterKey: true,
			}),
		).resolves.toEqual([])
		await expect(
			VisibleRecord.findMany(
				{ where: { isDeleted: { eq: true } } },
				{ ultimabase: app },
			),
		).resolves.toEqual([])
	})

	it('cannot target a tombstoned row through ordinary update or delete', async () => {
		const { database, ultimabase: app } = getFixture()
		const row = await VisibleRecord.createOne(
			{ data: { title: 'target' } },
			{ ultimabase: app },
		)
		await database.pool.query(
			`update soft_delete_visible_records set "isDeleted" = true where id = $1`,
			[row.id],
		)

		await expect(
			VisibleRecord.updateOne(
				{ data: { title: 'changed' }, id: row.id },
				{ ultimabase: app },
			),
		).resolves.toBeNull()
		await expect(
			VisibleRecord.deleteOne({ id: row.id }, { ultimabase: app }),
		).resolves.toBeNull()

		const stored = await database.pool.query<{
			isDeleted: boolean
			title: string
		}>(
			`select "isDeleted", title from soft_delete_visible_records where id = $1`,
			[row.id],
		)
		expect(stored.rows).toStrictEqual([{ isDeleted: true, title: 'target' }])
	})

	it('rewrites native delete while preserving logical Access, Hooks, results, and Master visibility', async () => {
		const { database, ultimabase: app } = getFixture()
		replaceDeleteTrace.length = 0
		rejectedDeleteTitle = undefined
		const row = await ReplaceRecord.createOne(
			{
				data: { title: 'logical delete' },
				select: { isDeleted: true, title: true },
			},
			{ ultimabase: app },
		)

		const deleted = await ReplaceRecord.deleteOne(
			{ id: row.id, select: { id: true, isDeleted: true, title: true } },
			{ ultimabase: app },
		)

		expect(deleted?.toJSON()).toStrictEqual({
			id: row.id,
			isDeleted: false,
			title: 'logical delete',
		})
		expect(replaceDeleteTrace).toStrictEqual([
			'before:delete:logical delete',
			'after:delete:logical delete',
			'committed:delete-one',
		])
		const stored = await database.pool.query<{
			isDeleted: boolean
			title: string
		}>(
			`select "isDeleted", title from soft_delete_replace_records where id = $1`,
			[row.id],
		)
		expect(stored.rows).toStrictEqual([
			{ isDeleted: true, title: 'logical delete' },
		])
		await expect(
			ReplaceRecord.findOne(
				{ where: { id: { eq: row.id } } },
				{ ultimabase: app, useMasterKey: true },
			),
		).resolves.toBeNull()
		await expect(
			ReplaceRecord.deleteOne({ id: row.id }, { ultimabase: app }),
		).resolves.toBeNull()

		const masterRow = await ReplaceRecord.createOne(
			{ data: { title: 'master logical delete' } },
			{ ultimabase: app, useMasterKey: true },
		)
		await masterRow.delete({}, { ultimabase: app, useMasterKey: true })
		const masterStored = await database.pool.query<{ isDeleted: boolean }>(
			`select "isDeleted" from soft_delete_replace_records where id = $1`,
			[masterRow.id],
		)
		expect(masterStored.rows).toStrictEqual([{ isDeleted: true }])
	})

	it('rolls back an ordered itemized delete batch without replaying update policy or hooks', async () => {
		const { database, ultimabase: app } = getFixture()
		replaceDeleteTrace.length = 0
		const [first, second] = await ReplaceRecord.createMany(
			{
				data: [{ title: 'batch first' }, { title: 'batch rejected' }],
			},
			{ ultimabase: app },
		)
		if (first === undefined || second === undefined) {
			throw new TypeError('Expected both replace-delete batch records')
		}
		rejectedDeleteTitle = 'batch rejected'

		await expect(
			ReplaceRecord.deleteMany(
				{
					where: [{ id: { eq: first.id } }, { id: { eq: second.id } }],
				},
				{ ultimabase: app },
			),
		).rejects.toThrow('replace-delete batch rejected')
		expect(replaceDeleteTrace).toStrictEqual([
			'before:delete:batch first',
			'after:delete:batch first',
			'before:delete:batch rejected',
		])
		const stored = await database.pool.query<{ isDeleted: boolean }>(
			`select "isDeleted" from soft_delete_replace_records
			 where id = any($1::uuid[])
			 order by id`,
			[[first.id, second.id]],
		)
		expect(stored.rows).toStrictEqual([
			{ isDeleted: false },
			{ isDeleted: false },
		])
		rejectedDeleteTitle = undefined
	})

	it('retains native hard-delete persistence for explicit and disabled schemas', async () => {
		const { database, ultimabase: app } = getFixture()
		const explicit = await VisibleRecord.createOne(
			{ data: { title: 'explicit hard delete' } },
			{ ultimabase: app },
		)
		const disabled = await PlainRecord.createOne(
			{ data: { title: 'disabled hard delete' } },
			{ ultimabase: app },
		)

		await VisibleRecord.deleteOne({ id: explicit.id }, { ultimabase: app })
		await PlainRecord.deleteOne({ id: disabled.id }, { ultimabase: app })

		const rows = await database.pool.query<{ remaining: number }>(
			`select (
				select count(*)::int from soft_delete_visible_records where id = $1
			) + (
				select count(*)::int from soft_delete_plain_records where id = $2
			) as remaining`,
			[explicit.id, disabled.id],
		)
		expect(rows.rows).toStrictEqual([{ remaining: 0 }])
	})

	it('rejects a later middleware attempt to write the protected tombstone', async () => {
		const { database, ultimabase: app } = getFixture()
		const row = await VisibleRecord.createOne(
			{ data: { title: 'middleware target' } },
			{ ultimabase: app },
		)

		await expect(
			VisibleRecord.updateOne(
				{ data: { title: 'middleware changed' }, id: row.id },
				{ ultimabase: app },
			),
		).rejects.toThrow(
			'prepared-operation contribution must preserve the normalized update shape',
		)

		const stored = await database.pool.query<{
			isDeleted: boolean
			title: string
		}>(
			`select "isDeleted", title from soft_delete_visible_records where id = $1`,
			[row.id],
		)
		expect(stored.rows).toStrictEqual([
			{ isDeleted: false, title: 'middleware target' },
		])
	})

	it('hides tombstones from pointer, relation, eager, and nested target paths', async () => {
		const { database, ultimabase: app } = getFixture()
		const author = await Author.createOne(
			{ data: { name: 'Ada' } },
			{ ultimabase: app },
		)
		const tag = await Tag.createOne(
			{ data: { label: 'hidden' } },
			{ ultimabase: app },
		)
		const article = await Article.createOne(
			{
				data: { author: { connect: author.id }, title: 'relations' },
			},
			{ ultimabase: app },
		)
		await article.relation('tags').connect(tag.id, { ultimabase: app })

		await database.pool.query(
			`update soft_delete_visibility_authors set "isDeleted" = true where id = $1`,
			[author.id],
		)
		await database.pool.query(
			`update soft_delete_visibility_tags set "isDeleted" = true where id = $1`,
			[tag.id],
		)

		const [loaded] = await Article.findMany(
			{ include: { author: {}, tags: {} } },
			{ ultimabase: app },
		)
		if (loaded === undefined) throw new TypeError('Expected the active article')
		expect(loaded.author).toBeNull()
		expect(loaded.tags).toStrictEqual([])
		await expect(
			article.relation('tags').count(undefined, { ultimabase: app }),
		).resolves.toBe(0)
		await expect(
			article.relation('tags').exists(undefined, { ultimabase: app }),
		).resolves.toBe(false)
		await expect(
			Author.pointer(author.id).findOne(undefined, { ultimabase: app }),
		).resolves.toBeNull()
		await expect(
			Article.createOne(
				{
					data: {
						author: { connect: author.id },
						title: 'cannot reconnect',
					},
				},
				{ ultimabase: app },
			),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
	})
})
