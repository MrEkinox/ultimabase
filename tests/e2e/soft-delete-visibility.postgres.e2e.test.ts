import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { accessPlugin } from '@ultimabase/access-plugin'
import {
	MasterAuthority,
	Schema,
	UltimaBase,
	definePlugin,
	preparedOperation,
	provideRuntimeInterceptor,
	type SchemaOptions,
} from '@ultimabase/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const VisibleRecord = Schema.define({
	className: 'SoftDeleteVisibleRecord',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: 'explicit',
} as SchemaOptions<'SoftDeleteVisibleRecord'> & {
	readonly softDelete: 'explicit'
})

const PlainRecord = Schema.define({
	className: 'SoftDeletePlainRecord',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: false,
} as SchemaOptions<'SoftDeletePlainRecord'> & {
	readonly softDelete: false
})

const staleTombstoneWriter = definePlugin({
	core: '^0.0.0',
	pluginId: 'fixture.soft-delete-stale-tombstone-writer',
	privileges: [
		{
			name: 'runtime:intercept',
			reason:
				'Proves final structural validation protects plugin-owned fields.',
		},
	] as const,
	version: '1.0.0',
	capabilities: {
		provides: [
			provideRuntimeInterceptor({
				contributionId: 'stale-tombstone-write',
				create: () => ({
					value: preparedOperation({
						schema: VisibleRecord,
						handler: ({ operation }) => ({
							operation: {
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
							},
						}),
					}),
				}),
			}),
		],
	},
})

const Author = Schema.define({
	className: 'SoftDeleteVisibilityAuthor',
	fields: (field) => ({ name: field.string({ required: true }) }),
	softDelete: 'explicit',
} as SchemaOptions<'SoftDeleteVisibilityAuthor'> & {
	readonly softDelete: 'explicit'
})

const Tag = Schema.define({
	className: 'SoftDeleteVisibilityTag',
	fields: (field) => ({ label: field.string({ required: true }) }),
	softDelete: 'explicit',
} as SchemaOptions<'SoftDeleteVisibilityTag'> & {
	readonly softDelete: 'explicit'
})

const Article = Schema.define({
	className: 'SoftDeleteVisibilityArticle',
	fields: (field) => ({
		author: field.pointer({ target: 'SoftDeleteVisibilityAuthor' }),
		tags: field.relation({ target: 'SoftDeleteVisibilityTag' }),
		title: field.string({ required: true }),
	}),
	softDelete: 'explicit',
} as SchemaOptions<'SoftDeleteVisibilityArticle'> & {
	readonly softDelete: 'explicit'
})

const schemas = [VisibleRecord, PlainRecord, Author, Tag, Article] as const
type SoftDeleteApplication = UltimaBase<
	typeof schemas,
	readonly [
		ReturnType<typeof softDeletePlugin>,
		ReturnType<typeof accessPlugin>,
		typeof staleTombstoneWriter,
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
			accessPlugin({ default: true }),
			staleTombstoneWriter,
			postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
		],
		schemas,
	})

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

		await expect(
			VisibleRecord.createOne(
				{ data: { isDeleted: true, title: 'forbidden' } } as never,
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
				data: { author: Author.pointer(author.id), title: 'relations' },
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
