import { Schema, booleanField, stringField } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { RelationPredicate } from '../filters/relation.js'
import {
	deleteSchemaRecord,
	updateSchemaRecord,
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
				data: { set: { published: true } },
			}),
		).toThrow(
			new TypeError(
				"schema command where must contain a filter; use 'all' for every row",
			),
		)
	})

	it('rejects predicates created for another schema', () => {
		const foreignWhere = new RelationPredicate(ForeignPost)

		expect(() =>
			updateSchemaRecord(Post, {
				// This assertion models an untyped transport returning a foreign builder.
				where: () => foreignWhere as unknown as SchemaWhere<typeof Post>,
				data: { set: { published: true } },
			}),
		).toThrow(
			new TypeError(
				'schema command where must return the supplied schema filter',
			),
		)
	})

	it('requires singular commands to target an exact unique key', () => {
		expect(() =>
			updateSchemaRecord(Post, {
				where: (where) => where.equalTo('title', 'Not unique'),
				data: { set: { published: true } },
			}),
		).toThrow(
			new TypeError(
				'schema updateOne where must match id or one declared unique index',
			),
		)
		expect(() =>
			deleteSchemaRecord(Post, {
				where: (where) => where.equalTo('published', false),
			}),
		).toThrow(
			new TypeError(
				'schema deleteOne where must match id or one declared unique index',
			),
		)
	})

	it('validates command wrappers before resolving execution context', () => {
		const malformedInput: unknown = {
			where: (where: SchemaWhere<typeof Post>) => where.byId('post-1'),
			data: { set: { title: 'Updated' } },
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
	})
})
