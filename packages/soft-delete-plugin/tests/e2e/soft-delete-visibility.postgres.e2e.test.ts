import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	getOperationSchema,
	MasterAuthority,
	UltimaBase,
	preparedOperation,
	provideRuntimeBehavior,
	provideRuntimeInterceptor,
} from '@ultimabase/core'
import { plugin, type PluginSourceState } from '@ultimabase/core/plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

const SoftDeleteSchemaApplication = UltimaBase.use(softDeletePlugin())
	.use(hooksPlugin())
	.use(accessPlugin({ allowWithoutRule: { all: true } }))

const VisibleRecord = SoftDeleteSchemaApplication.Schema.define({
	className: 'SoftDeleteVisibleRecord',
	fields: (field) => ({ title: field.string({ required: true }) }),
}).softDelete({ mode: 'command' })

const PlainRecord = SoftDeleteSchemaApplication.Schema.define({
	className: 'SoftDeletePlainRecord',
	fields: (field) => ({ title: field.string({ required: true }) }),
})

const replaceDeleteTrace: string[] = []
let rejectedDeleteTitle: string | undefined

const ReplaceRecord = SoftDeleteSchemaApplication.Schema.define({
	className: 'SoftDeleteReplaceRecord',
	fields: (field) => ({ title: field.string({ required: true }) }),
})
	.softDelete()
	.with({
		access: {
			create: true,
			delete: true,
			read: true,
			update: false,
		},
		hooks: {
			afterOperation: {
				delete: ({ originalItem }) => {
					replaceDeleteTrace.push(`after:delete:${originalItem.title}`)
				},
				update: () => {
					replaceDeleteTrace.push('after:update')
				},
			},
			beforeOperation: {
				delete: ({ originalItem }) => {
					const title = originalItem.title
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
}).softDelete({ mode: 'command' })

const Tag = SoftDeleteSchemaApplication.Schema.define({
	className: 'SoftDeleteVisibilityTag',
	fields: (field) => ({ label: field.string({ required: true }) }),
}).softDelete({ mode: 'command' })

const Article = SoftDeleteSchemaApplication.Schema.define({
	className: 'SoftDeleteVisibilityArticle',
	fields: (field) => ({
		author: field.pointer({ target: () => Author }),
		tags: field.relation({ target: () => Tag }),
		title: field.string({ required: true }),
	}),
}).softDelete({ mode: 'command' })

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
	],
	PluginSourceState
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
	ultimabase = new (SoftDeleteSchemaApplication.use(
		staleTombstoneWriter,
		replaceDeleteObserver,
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'soft-delete-e2e-master', value: 'unused' }],
			onUse: () => undefined,
		}),
		logger: false,
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
	it('persists the owned columns only for enabled schemas', async () => {
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
			   and column_name in ('is_deleted', 'deleted_at')
			 order by column_name`,
			[database.schemaName],
		)

		expect(columns.rows).toEqual([
			expect.objectContaining({
				column_default: null,
				column_name: 'deleted_at',
				is_nullable: 'YES',
			}),
			expect.objectContaining({
				column_default: 'false',
				column_name: 'is_deleted',
				is_nullable: 'NO',
			}),
		])
	})

	it('rejects caller tombstones and filters every ordinary read including Master', async () => {
		const { database } = getFixture()
		const createUntrustedVisibleRecord = VisibleRecord.createOne.bind(
			VisibleRecord,
		) as unknown as (input: unknown) => Promise<unknown>

		await expect(
			createUntrustedVisibleRecord({
				data: { isDeleted: true, title: 'forbidden' },
			}),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })

		const active = await VisibleRecord.createOne({
			data: { title: 'active' },
			select: { isDeleted: true, title: true },
		})
		expect(active).toMatchObject({ isDeleted: false, title: 'active' })

		await database.pool.query(
			`update soft_delete_visible_records set is_deleted = true where id = $1`,
			[active.id],
		)

		await expect(VisibleRecord.findMany(undefined)).resolves.toEqual([])
		await expect(VisibleRecord.count(undefined)).resolves.toBe(0)
		await expect(
			VisibleRecord.exists({ where: { id: { eq: active.id } } }),
		).resolves.toBe(false)
		await expect(
			VisibleRecord.findMany(undefined, {
				useMasterKey: true,
			}),
		).resolves.toEqual([])
		await expect(
			VisibleRecord.findMany({ where: { isDeleted: { eq: true } } }),
		).resolves.toEqual([])
	})

	it('cannot target a tombstoned row through ordinary update or delete', async () => {
		const { database } = getFixture()
		const row = await VisibleRecord.createOne({ data: { title: 'target' } })
		await database.pool.query(
			`update soft_delete_visible_records set is_deleted = true where id = $1`,
			[row.id],
		)

		await expect(
			VisibleRecord.updateOne({
				data: { title: 'changed' },
				where: { id: row.id },
			}),
		).resolves.toBeNull()
		await expect(
			VisibleRecord.deleteOne({ where: { id: row.id } }),
		).resolves.toBeNull()

		const stored = await database.pool.query<{
			isDeleted: boolean
			title: string
		}>(
			`select is_deleted as "isDeleted", title from soft_delete_visible_records where id = $1`,
			[row.id],
		)
		expect(stored.rows).toStrictEqual([{ isDeleted: true, title: 'target' }])
	})

	it('rewrites native delete while preserving logical Access, Hooks, results, and Master visibility', async () => {
		const { database } = getFixture()
		replaceDeleteTrace.length = 0
		rejectedDeleteTitle = undefined
		const row = await ReplaceRecord.createOne({
			data: { title: 'logical delete' },
			select: { isDeleted: true, title: true },
		})

		const deleted = await ReplaceRecord.deleteOne({
			where: { id: row.id },
			select: { id: true, isDeleted: true, title: true },
		})

		// A logical delete returns the row as written (ADR-0306 amendment).
		expect(deleted).toStrictEqual({
			id: row.id,
			isDeleted: true,
			title: 'logical delete',
		})
		const stamped = await database.pool.query<{ deletedAt: Date | null }>(
			`select deleted_at as "deletedAt" from soft_delete_replace_records where id = $1`,
			[row.id],
		)
		expect(stamped.rows[0]?.deletedAt).toBeInstanceOf(Date)
		expect(replaceDeleteTrace).toStrictEqual([
			'before:delete:logical delete',
			'after:delete:logical delete',
			'committed:delete-one',
		])
		const stored = await database.pool.query<{
			isDeleted: boolean
			title: string
		}>(
			`select is_deleted as "isDeleted", title from soft_delete_replace_records where id = $1`,
			[row.id],
		)
		expect(stored.rows).toStrictEqual([
			{ isDeleted: true, title: 'logical delete' },
		])
		await expect(
			ReplaceRecord.findOne(
				{ where: { id: { eq: row.id } } },
				{ useMasterKey: true },
			),
		).resolves.toBeNull()
		await expect(
			ReplaceRecord.deleteOne({ where: { id: row.id } }),
		).resolves.toBeNull()

		const masterRow = await ReplaceRecord.createOne(
			{ data: { title: 'master logical delete' } },
			{ useMasterKey: true },
		)
		await ReplaceRecord.deleteOne(
			{ where: { id: { eq: masterRow.id } } },
			{ useMasterKey: true },
		)
		const masterStored = await database.pool.query<{ isDeleted: boolean }>(
			`select is_deleted as "isDeleted" from soft_delete_replace_records where id = $1`,
			[masterRow.id],
		)
		expect(masterStored.rows).toStrictEqual([{ isDeleted: true }])
	})

	it('rolls back an ordered itemized delete batch without replaying update policy or hooks', async () => {
		const { database } = getFixture()
		replaceDeleteTrace.length = 0
		const [first, second] = await ReplaceRecord.createMany({
			data: [{ title: 'batch first' }, { title: 'batch rejected' }],
		})
		if (first === undefined || second === undefined) {
			throw new TypeError('Expected both replace-delete batch records')
		}
		rejectedDeleteTitle = 'batch rejected'

		await expect(
			ReplaceRecord.deleteMany({
				where: [{ id: { eq: first.id } }, { id: { eq: second.id } }],
			}),
		).rejects.toThrow('replace-delete batch rejected')
		expect(replaceDeleteTrace).toStrictEqual([
			'before:delete:batch first',
			'after:delete:batch first',
			'before:delete:batch rejected',
		])
		const stored = await database.pool.query<{ isDeleted: boolean }>(
			`select is_deleted as "isDeleted" from soft_delete_replace_records
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

	it('retains native hard-delete persistence for command-mode and plain schemas', async () => {
		const { database } = getFixture()
		const explicit = await VisibleRecord.createOne({
			data: { title: 'explicit hard delete' },
		})
		const disabled = await PlainRecord.createOne({
			data: { title: 'disabled hard delete' },
		})

		await VisibleRecord.deleteOne({ where: { id: explicit.id } })
		await PlainRecord.deleteOne({ where: { id: disabled.id } })

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
		const { database } = getFixture()
		const row = await VisibleRecord.createOne({
			data: { title: 'middleware target' },
		})

		await expect(
			VisibleRecord.updateOne({
				data: { title: 'middleware changed' },
				where: { id: row.id },
			}),
		).rejects.toThrow(
			'prepared-operation contribution must preserve the normalized update shape',
		)

		const stored = await database.pool.query<{
			isDeleted: boolean
			title: string
		}>(
			`select is_deleted as "isDeleted", title from soft_delete_visible_records where id = $1`,
			[row.id],
		)
		expect(stored.rows).toStrictEqual([
			{ isDeleted: false, title: 'middleware target' },
		])
	})

	it('hides tombstones from pointer, relation, eager, and nested target paths', async () => {
		const { database } = getFixture()
		const author = await Author.createOne({ data: { name: 'Ada' } })
		const tag = await Tag.createOne({ data: { label: 'hidden' } })
		const article = await Article.createOne({
			data: { author: { connect: author.id }, title: 'relations' },
		})
		await Article.updateOne({
			where: { id: { eq: article.id } },
			data: { tags: { connect: [tag.id] } },
		})

		await database.pool.query(
			`update soft_delete_visibility_authors set is_deleted = true where id = $1`,
			[author.id],
		)
		await database.pool.query(
			`update soft_delete_visibility_tags set is_deleted = true where id = $1`,
			[tag.id],
		)

		const [loaded] = await Article.findMany({
			include: { author: {}, tags: {} },
		})
		if (loaded === undefined) throw new TypeError('Expected the active article')
		expect(loaded.author).toBeNull()
		expect(loaded.tags).toStrictEqual([])
		await expect(
			Article.count({
				where: { id: { eq: article.id }, tags: { some: {} } },
			}),
		).resolves.toBe(0)
		await expect(
			Author.findOne({ where: { id: { eq: author.id } } }),
		).resolves.toBeNull()
		await expect(
			Article.createOne({
				data: {
					author: { connect: author.id },
					title: 'cannot reconnect',
				},
			}),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
	})
})
