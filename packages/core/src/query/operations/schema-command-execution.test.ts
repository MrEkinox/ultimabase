import { describe, expect, it } from 'vitest'

import { WhereBuilder, type WhereInput } from '../filters/where.js'
import {
	createSchemaRecord,
	createSchemaRecords,
	deleteSchemaRecord,
	deleteSchemaRecords,
	updateSchemaRecord,
	updateSchemaRecords,
	upsertSchemaRecord,
	upsertSchemaRecords,
} from './schema-command-execution.js'
import { SchemaRegistry } from '../../schema/index.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const Post = UltimaBase.Schema.define({
	className: 'SchemaCommandPost',
	fields: (field) => ({
		published: field.boolean(),
		slug: field.string({ indexed: 'unique' }),
		title: field.string(),
	}),
})

const ForeignPost = UltimaBase.Schema.define({
	className: 'ForeignSchemaCommandPost',
	fields: (field) => ({ title: field.string() }),
})

const Tag = UltimaBase.Schema.define({
	className: 'SchemaCommandTag',
	fields: (field) => ({ name: field.string() }),
})

const Article = UltimaBase.Schema.define({
	className: 'SchemaCommandArticle',
	fields: (field) => ({
		title: field.string(),
		tags: field.relation({ target: () => Tag }),
	}),
})

new SchemaRegistry([Tag, Article]).resolveSchemaTargets()

describe('schema command execution boundaries', () => {
	it('requires an explicit non-empty predicate for mutations', () => {
		expect(() =>
			updateSchemaRecord(Post, {
				where: {},
				data: { published: true },
			}),
		).toThrow(
			new TypeError(
				"schema command where must contain a filter; use 'all' for every row",
			),
		)
	})

	it('rejects predicates created for another schema', () => {
		const foreignWhere = new WhereBuilder(ForeignPost).eq('id', 'foreign-1')

		expect(() =>
			updateSchemaRecord(Post, {
				// This assertion models an untyped transport returning a foreign builder.
				where: foreignWhere as unknown as WhereInput<typeof Post>,
				data: { published: true },
			}),
		).toThrow(new TypeError('WhereBuilder must use the same schema definition'))
	})

	it('requires singular commands to target an exact unique key', () => {
		expect(() =>
			updateSchemaRecord(Post, {
				where: { title: { eq: 'Not unique' } },
				data: { published: true },
			}),
		).toThrow(
			new TypeError(
				'schema updateOne where must match id or one declared unique index',
			),
		)
		expect(() =>
			deleteSchemaRecord(Post, {
				where: { published: { eq: false } },
			}),
		).toThrow(
			new TypeError(
				'schema deleteOne where must match id or one declared unique index',
			),
		)
	})

	it('validates command wrappers before resolving execution context', () => {
		const malformedInput: unknown = {
			where: { id: { eq: 'post-1' } },
			data: { title: 'Updated' },
			extra: true,
		}

		expect(() =>
			updateSchemaRecord(
				Post,
				// Runtime validation protects JavaScript and transport callers.
				malformedInput as Parameters<typeof Post.updateOne>[0],
			),
		).toThrow(
			new TypeError('schema updateOne input contains unknown key: extra'),
		)

		expect(() =>
			updateSchemaRecord(Post, {
				data: { title: 'Updated' },
			} as never),
		).toThrow(new TypeError('schema updateOne input must contain key: where'))
		// ADR-0307 removed the top-level id alias: `where` is the only target.
		expect(() =>
			updateSchemaRecord(Post, {
				id: 'post-1',
				where: { id: { eq: 'post-1' } },
				data: { title: 'Updated' },
			} as never),
		).toThrow(new TypeError('schema updateOne input contains unknown key: id'))
		expect(() =>
			updateSchemaRecord(Post, {
				id: 'post-1',
				data: { title: 'Updated' },
			} as never),
		).toThrow(new TypeError('schema updateOne input contains unknown key: id'))
		expect(() => deleteSchemaRecord(Post, {} as never)).toThrow(
			new TypeError('schema deleteOne input must contain key: where'),
		)
		expect(() => deleteSchemaRecord(Post, { id: 'post-1' } as never)).toThrow(
			new TypeError('schema deleteOne input contains unknown key: id'),
		)

		expect(() =>
			updateSchemaRecord(Post, {
				where: { id: { eq: 'post-1' } },
				data: { title: 'Updated' },
				// This assertion models an untyped transport returning an unknown field.
				// @ts-expect-error -- Source typing also rejects the unknown selection.
				select: { missing: true },
			}),
		).toThrow(new TypeError('selection.missing must reference a schema field'))

		expect(() =>
			createSchemaRecord(Post, {
				data: { title: 'Created' },
				extra: true,
			} as never),
		).toThrow(new TypeError('schema create input contains unknown key: extra'))
		expect(() =>
			createSchemaRecord(Post, {
				data: { title: 'Created' },
				// This assertion models an untyped transport returning an unknown field.
				// @ts-expect-error -- Source typing also rejects the unknown selection.
				select: { missing: true },
			}),
		).toThrow(new TypeError('selection.missing must reference a schema field'))
		expect(() =>
			deleteSchemaRecord(Post, {
				where: { id: { eq: 'post-1' } },
				// This assertion models an untyped transport returning an unknown field.
				// @ts-expect-error -- Source typing also rejects the unknown selection.
				select: { missing: true },
			}),
		).toThrow(new TypeError('selection.missing must reference a schema field'))
		expect(() =>
			updateSchemaRecords(Post, {
				data: [{ where: { id: { eq: 'post-1' } }, data: { title: 'Updated' } }],
				// This assertion models an untyped transport returning an unknown field.
				// @ts-expect-error -- Source typing also rejects the unknown selection.
				select: { missing: true },
			}),
		).toThrow(new TypeError('selection.missing must reference a schema field'))
		expect(() =>
			deleteSchemaRecords(Post, {
				where: [{ id: { eq: 'post-1' } }],
				// This assertion models an untyped transport returning an unknown field.
				// @ts-expect-error -- Source typing also rejects the unknown selection.
				select: { missing: true },
			}),
		).toThrow(new TypeError('selection.missing must reference a schema field'))
		expect(() =>
			createSchemaRecords(Post, {
				data: [{ title: 'Created' }],
				// @ts-expect-error -- Runtime still rejects selections from untyped callers.
				select: { missing: true },
			}),
		).toThrow(new TypeError('selection.missing must reference a schema field'))
		expect(() =>
			upsertSchemaRecord(Post, {
				where: { id: { eq: 'post-1' } },
				create: { title: 'Created' },
				update: { title: 'Updated' },
				// @ts-expect-error -- Runtime still rejects selections from untyped callers.
				select: { missing: true },
			}),
		).toThrow(new TypeError('selection.missing must reference a schema field'))
		expect(() =>
			upsertSchemaRecords(Post, {
				data: [
					{
						where: { id: { eq: 'post-1' } },
						create: { title: 'Created' },
						update: { title: 'Updated' },
					},
				],
				// @ts-expect-error -- Runtime still rejects selections from untyped callers.
				select: { missing: true },
			}),
		).toThrow(new TypeError('selection.missing must reference a schema field'))
	})

	it('rejects malformed collection inputs before starting execution', () => {
		// These checks run at the public command boundary before an application is required.
		expect(() => createSchemaRecords(Post, { data: {} as never })).toThrow(
			new TypeError('schema createMany data must be an array'),
		)
		expect(() => updateSchemaRecords(Post, { data: {} as never })).toThrow(
			new TypeError('schema updateMany data must be an array'),
		)
		expect(() => upsertSchemaRecords(Post, { data: {} as never })).toThrow(
			new TypeError('schema upsertMany data must be an array'),
		)
		expect(() => deleteSchemaRecords(Post, { where: {} as never })).toThrow(
			new TypeError('schema deleteMany where must be an array'),
		)
		expect(() =>
			upsertSchemaRecords(Post, {
				data: [
					{
						where: { id: { eq: 'post-1' } },
						create: { title: 'Created' },
						update: { title: 'Updated' },
						extra: true,
					},
				] as never,
			}),
		).toThrow(
			new TypeError('schema upsertMany data[0] contains unknown key: extra'),
		)
		expect(() =>
			upsertSchemaRecords(Post, {
				data: [
					{
						create: { title: 'Created' },
						update: { title: 'Updated' },
					},
				] as never,
			}),
		).toThrow(
			new TypeError('schema upsertMany data[0] must contain key: where'),
		)
	})

	it('rejects a relation in a mutation result selection before execution', () => {
		const relation = new TypeError(
			'selection.tags must not reference a relation; read relations through include',
		)
		const id = '0199325a-0c00-7000-8000-000000000001'
		const where = { id: { eq: id } }
		// Untyped transports can send a relation name that source typing rejects.
		const select = { title: true, tags: true } as never

		for (const command of [
			() => createSchemaRecord(Article, { data: { title: 'A' }, select }),
			() => createSchemaRecords(Article, { data: [{ title: 'A' }], select }),
			() =>
				updateSchemaRecord(Article, { where, data: { title: 'B' }, select }),
			() =>
				updateSchemaRecords(Article, {
					data: [{ where, data: { title: 'B' } }],
					select,
				}),
			() => deleteSchemaRecord(Article, { where, select }),
			() => deleteSchemaRecords(Article, { where: [where], select }),
			() =>
				upsertSchemaRecord(Article, {
					where,
					create: { title: 'A' },
					update: { title: 'B' },
					select,
				}),
			() =>
				upsertSchemaRecords(Article, {
					data: [{ where, create: { title: 'A' }, update: { title: 'B' } }],
					select,
				}),
		]) {
			expect(command).toThrow(relation)
		}
	})
})
