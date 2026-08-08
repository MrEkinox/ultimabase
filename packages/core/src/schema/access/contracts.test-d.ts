import { expect, expectTypeOf, test } from 'vitest'

import {
	Schema,
	booleanField,
	stringField,
	type InferCreateInput,
	type InferObject,
	type SchemaAccess,
	type SchemaPreparedDraft,
	type SchemaResult,
} from '../index.js'
import type { WhereBuilder } from '../../query/index.js'
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
		read: {
			allow: {
				one: (input) => {
					const { context } = input

					expectTypeOf(context).toEqualTypeOf<AccessContext>()
					expectTypeOf(context.getValue(principalId)).toEqualTypeOf<
						string | undefined
					>()
					// @ts-expect-error -- Operation Access exposes no terminal cardinality.
					void input.kind
					// @ts-expect-error -- Access does not expose diagnostic metadata.
					void context.metadata
					// @ts-expect-error -- Access decisions cannot enqueue side effects.
					void context.emit
					// @ts-expect-error -- Access decisions cannot own transactions.
					void context.commit

					return context.access.mode === 'master'
				},
				many: true,
				count: false,
				exists: true,
			},
			where: (input) => {
				const { context, where } = input

				expectTypeOf(where).toEqualTypeOf<WhereBuilder<typeof Article>>()
				expectTypeOf(context).toEqualTypeOf<AccessContext>()
				// @ts-expect-error -- One where rule defines every read capability's row universe.
				void input.kind

				return { published: { eq: true } }
			},
		},
		create: {
			allow: ({ context }): Promise<boolean> => {
				expectTypeOf(context).toEqualTypeOf<AccessContext>()

				return Promise.resolve(true)
			},
			item: ({ item }) => {
				expectTypeOf(item).toEqualTypeOf<SchemaPreparedDraft<typeof Article>>()

				return item.authorId.length > 0
			},
		},
		update: {
			allow: true,
			where: async ({ where }) => Promise.resolve(where.eq('published', false)),
			item: ({ originalItem, item }) => {
				expectTypeOf(originalItem).toEqualTypeOf<SchemaResult<typeof Article>>()
				expectTypeOf(item).toEqualTypeOf<
					Readonly<InferObject<typeof Article>>
				>()

				return originalItem.authorId === item.authorId
			},
		},
		upsert: {
			allow: true,
			item: (input) => {
				if (input.mode === 'create') {
					expectTypeOf(input.originalItem).toEqualTypeOf<null>()
					expectTypeOf(input.item).toEqualTypeOf<
						SchemaPreparedDraft<typeof Article>
					>()
				} else {
					expectTypeOf(input.originalItem).toEqualTypeOf<
						SchemaResult<typeof Article>
					>()
					expectTypeOf(input.item).toEqualTypeOf<
						Readonly<InferObject<typeof Article>>
					>()
				}

				return true
			},
		},
		delete: {
			allow: false,
			where: { published: { eq: false } },
			item: ({ originalItem }) => {
				expectTypeOf(originalItem).toEqualTypeOf<SchemaResult<typeof Article>>()

				return originalItem.authorId.length > 0
			},
		},
	},
	fields: {
		authorId: stringField({ validation: { required: true } }),
		published: booleanField({
			access: {
				read: {
					output: ({ value }) => {
						expectTypeOf(value).toEqualTypeOf<boolean | null>()

						return true
					},
					where: ({ context }) => context.access.mode === 'master',
					orderBy: ({ context }) => context.access.mode === 'master',
				},
				write: {
					fill: ({ context, value }) => {
						expectTypeOf(context).toEqualTypeOf<AccessContext>()
						expectTypeOf(value).toEqualTypeOf<boolean>()

						return true
					},
					replace: ({ originalValue, value }): Promise<boolean> => {
						expectTypeOf(originalValue).toEqualTypeOf<boolean>()
						expectTypeOf(value).toEqualTypeOf<boolean>()

						return Promise.resolve(true)
					},
					clear: ({ originalValue }) => {
						expectTypeOf(originalValue).toEqualTypeOf<boolean | null>()

						return true
					},
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
		| 'count'
		| 'createOne'
		| 'createMany'
		| 'deleteMany'
		| 'deleteOne'
		| 'definition'
		| 'extensions'
		| 'exists'
		| 'fields'
		| 'findMany'
		| 'findOne'
		| 'get'
		| 'indexes'
		| 'pointer'
		| 'updateMany'
		| 'updateOne'
		| 'upsertOne'
		| 'upsertMany'
	>()
	expectTypeOf<InferCreateInput<typeof Article>>().toEqualTypeOf<{
		authorId: string
		published?: boolean | null
		title: string
	}>()
	expectTypeOf<InferObject<typeof Article>>().toEqualTypeOf<{
		readonly authorId: string
		readonly createdAt: string
		readonly id: string
		readonly published: boolean | null
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
			create: {
				// @ts-expect-error -- create has no persisted row to restrict.
				where: { title: { eq: 'invalid' } },
			},
			read: {
				// @ts-expect-error -- decisions return booleans, never labels.
				allow: () => 'allow',
			},
		},
	})

	stringField({
		access: {
			// @ts-expect-error -- writes are grouped under the write capability.
			create: true,
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
			// @ts-expect-error -- shared field callbacks are intentionally unsupported.
			read: () => ({ allow: true }),
		},
	})
	stringField({
		access: {
			// @ts-expect-error -- grouped field reads require every disclosure channel.
			read: { output: true, where: false },
		},
	})
	stringField({
		access: {
			read: {
				// @ts-expect-error -- predicate disclosure is named after public where input.
				filter: false,
				order: false,
				output: true,
			},
		},
	})
	stringField({
		access: {
			// @ts-expect-error -- the intermediate operation-oriented write shape is unsupported.
			write: { create: true, update: false },
		},
	})
	stringField({
		access: {
			// @ts-expect-error -- detailed writes require every transition.
			write: { fill: true, replace: true },
		},
	})
	Schema.define({
		className: 'IncompleteReadAccess',
		fields: {},
		access: {
			read: {
				// @ts-expect-error -- grouped schema reads require every cardinality branch.
				allow: { one: true, many: true, count: false },
			},
		},
	})
})
