import { Schema, booleanField, stringField } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { WhereBuilder } from '../filters/where.js'
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
import type { SchemaWhere } from './schema-commands.js'

const Post = Schema.define({
	className: 'SchemaCommandPost',
	fields: {
		published: booleanField(),
		slug: stringField({ indexed: 'unique' }),
		title: stringField(),
	},
})

const ForeignPost = Schema.define({
	className: 'ForeignSchemaCommandPost',
	fields: { title: stringField() },
})

describe('schema command execution boundaries', () => {
	it('requires an explicit non-empty predicate for mutations', () => {
		expect(() =>
			updateSchemaRecord(Post, {
				where: (where) => where,
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
				where: () => foreignWhere as unknown as SchemaWhere<typeof Post>,
				data: { published: true },
			}),
		).toThrow(new TypeError('WhereBuilder must use the same schema definition'))
	})

	it('requires singular commands to target an exact unique key', () => {
		expect(() =>
			updateSchemaRecord(Post, {
				where: (where) => where.eq('title', 'Not unique'),
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
			where: (where: SchemaWhere<typeof Post>) => where.eq('id', 'post-1'),
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
				where: { id: { eq: 'post-1' } },
				data: { title: 'Updated' },
				// This assertion models an untyped transport returning an unknown field.
				select: { missing: true } as never,
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
				select: { missing: true } as never,
			}),
		).toThrow(new TypeError('selection.missing must reference a schema field'))
		expect(() =>
			deleteSchemaRecord(Post, {
				where: { id: { eq: 'post-1' } },
				// This assertion models an untyped transport returning an unknown field.
				select: { missing: true } as never,
			}),
		).toThrow(new TypeError('selection.missing must reference a schema field'))
		expect(() =>
			updateSchemaRecords(Post, {
				data: [{ where: { id: { eq: 'post-1' } }, data: { title: 'Updated' } }],
				// This assertion models an untyped transport returning an unknown field.
				select: { missing: true } as never,
			}),
		).toThrow(new TypeError('selection.missing must reference a schema field'))
		expect(() =>
			deleteSchemaRecords(Post, {
				where: [{ id: { eq: 'post-1' } }],
				// This assertion models an untyped transport returning an unknown field.
				select: { missing: true } as never,
			}),
		).toThrow(new TypeError('selection.missing must reference a schema field'))
		expect(() =>
			createSchemaRecords(Post, {
				data: [{ title: 'Created' }],
				select: { missing: true } as never,
			}),
		).toThrow(new TypeError('selection.missing must reference a schema field'))
		expect(() =>
			upsertSchemaRecord(Post, {
				where: { id: { eq: 'post-1' } },
				create: { title: 'Created' },
				update: { title: 'Updated' },
				select: { missing: true } as never,
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
				select: { missing: true } as never,
			}),
		).toThrow(new TypeError('selection.missing must reference a schema field'))
	})
})
