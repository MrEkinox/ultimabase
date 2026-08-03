import { expect, expectTypeOf, test } from 'vitest'

import {
	Schema,
	booleanField,
	stringField,
	type AccessFilter,
	type InferCreateInput,
	type InferObject,
	type InferUpdateInput,
	type SchemaAccess,
} from '../index.js'
import { RequestContextValue, type AccessContext } from '../../access/index.js'
import type { RequestContext } from '../../runtime/index.js'

const principalId = new RequestContextValue<string>('principal.id', (value) => {
	if (typeof value !== 'string') {
		throw new TypeError('principal.id must be a string')
	}

	return value
})

const Article = Schema.define({
	className: 'AccessArticle',
	access: {
		operation: {
			read: {
				one: ({ context, kind }) => {
					expectTypeOf(context).toEqualTypeOf<AccessContext>()
					expectTypeOf(kind).toEqualTypeOf<'first' | 'get'>()
					expectTypeOf(context.getValue(principalId)).toEqualTypeOf<
						string | undefined
					>()
					// @ts-expect-error -- Access does not expose diagnostic metadata.
					void context.metadata
					// @ts-expect-error -- Access decisions cannot enqueue side effects.
					void context.emit
					// @ts-expect-error -- Access decisions cannot own transactions.
					void context.commit

					return context.access.mode === 'master'
				},
				many: ({ kind }) => {
					expectTypeOf(kind).toEqualTypeOf<'find'>()

					return true
				},
				count: ({ kind }) => {
					expectTypeOf(kind).toEqualTypeOf<'count'>()

					return false
				},
				exists: ({ kind }) => {
					expectTypeOf(kind).toEqualTypeOf<'exists'>()

					return true
				},
			},
			create: ({ kind }): Promise<boolean> => {
				expectTypeOf(kind).toEqualTypeOf<'create-many' | 'create-one'>()

				return Promise.resolve(true)
			},
			update: ({ kind }) => {
				expectTypeOf(kind).toEqualTypeOf<'update-many' | 'update-one'>()

				return true
			},
			upsert: ({ kind }) => {
				expectTypeOf(kind).toEqualTypeOf<'upsert-many' | 'upsert-one'>()

				return true
			},
			delete: ({ kind }) => {
				expectTypeOf(kind).toEqualTypeOf<'delete-many' | 'delete-one'>()

				return false
			},
		},
		filter: {
			read: (input) => {
				const { context, filter } = input

				expectTypeOf(filter).toEqualTypeOf<AccessFilter<typeof Article>>()
				expectTypeOf(context).toEqualTypeOf<AccessContext>()
				// @ts-expect-error -- One filter defines every read terminal's row universe.
				void input.kind

				return filter.equalTo('published', true)
			},
			update: async ({ filter }) =>
				Promise.resolve(filter.equalTo('published', false)),
			delete: false,
		},
		item: {
			create: ({ input, item, mode }) => {
				expectTypeOf(input).toEqualTypeOf<{
					authorId: string
					published?: boolean
					title: string
				}>()
				expectTypeOf(item).toEqualTypeOf<InferObject<typeof Article>>()
				expectTypeOf(mode).toEqualTypeOf<'create'>()

				return input.authorId === item.authorId
			},
			update: ({ input, item }) => {
				expectTypeOf(input).toEqualTypeOf<InferUpdateInput<typeof Article>>()

				return input.authorId === undefined || input.authorId === item.authorId
			},
			upsert: (input) => {
				if (input.mode === 'create') {
					expectTypeOf(input.input).toEqualTypeOf<
						InferCreateInput<typeof Article>
					>()
				} else {
					expectTypeOf(input.input).toEqualTypeOf<
						InferUpdateInput<typeof Article>
					>()
				}

				return true
			},
			delete: ({ item }) => item.authorId.length > 0,
		},
	},
	fields: {
		authorId: stringField({ validation: { required: true } }),
		published: booleanField({
			access: {
				create: ({ context, kind, value }) => {
					expectTypeOf(context).toEqualTypeOf<AccessContext>()
					expectTypeOf(kind).toEqualTypeOf<
						'create-many' | 'create-one' | 'upsert-many' | 'upsert-one'
					>()
					expectTypeOf(value).toEqualTypeOf<boolean>()

					return true
				},
				read: {
					item: ({ channel, value }) => {
						expectTypeOf(channel).toEqualTypeOf<'item'>()
						expectTypeOf(value).toEqualTypeOf<boolean>()

						return true
					},
					filter: ({ channel, kind }) => {
						expectTypeOf(channel).toEqualTypeOf<'filter'>()
						expectTypeOf(kind).toEqualTypeOf<
							| 'count'
							| 'delete-many'
							| 'delete-one'
							| 'exists'
							| 'find'
							| 'first'
							| 'get'
							| 'update-many'
							| 'update-one'
							| 'upsert-many'
							| 'upsert-one'
						>()

						return false
					},
					order: ({ channel }) => {
						expectTypeOf(channel).toEqualTypeOf<'order'>()

						return true
					},
				},
				update: ({ value }): Promise<boolean> => {
					expectTypeOf(value).toEqualTypeOf<boolean>()

					return Promise.resolve(value)
				},
			},
		}),
		title: stringField({ validation: { required: true } }),
	},
})

test('keeps native Access outside schema metadata and value inference', () => {
	expect(Article.className).toBe('AccessArticle')
	expectTypeOf<RequestContext>().toExtend<AccessContext>()
	expectTypeOf<keyof typeof Article>().toEqualTypeOf<
		| 'className'
		| 'definition'
		| 'extensions'
		| 'fields'
		| 'indexes'
		| 'pointer'
		| 'query'
	>()
	expectTypeOf<InferCreateInput<typeof Article>>().toEqualTypeOf<{
		authorId: string
		published?: boolean
		title: string
	}>()
	expectTypeOf<InferObject<typeof Article>>().toEqualTypeOf<{
		readonly authorId: string
		readonly createdAt: string
		readonly id: string
		readonly published?: boolean
		readonly title: string
		readonly updatedAt: string
	}>()
	expectTypeOf<SchemaAccess<typeof Article>>().toBeObject()
})

test('rejects unsupported families and invalid callback results', () => {
	Schema.define({
		className: 'InvalidAccess',
		fields: { title: stringField() },
		access: {
			filter: {
				// @ts-expect-error -- create has no persisted row to restrict.
				create: true,
			},
			item: {
				// @ts-expect-error -- reads must use database-enforced row filters.
				read: true,
			},
			operation: {
				// @ts-expect-error -- decisions return booleans, never labels.
				read: () => 'allow',
			},
		},
	})

	stringField({
		access: {
			// @ts-expect-error -- field deletion is a schema or item decision.
			delete: true,
		},
	})
	stringField({
		access: {
			// @ts-expect-error -- field decisions return booleans.
			read: () => ({ allow: true }),
		},
	})
	stringField({
		access: {
			// @ts-expect-error -- grouped field reads require every disclosure channel.
			read: { item: true, filter: false },
		},
	})
	Schema.define({
		className: 'IncompleteReadAccess',
		fields: {},
		access: {
			operation: {
				// @ts-expect-error -- grouped schema reads require every cardinality branch.
				read: { one: true, many: true, count: false },
			},
		},
	})
})
