import { expectTypeOf, test } from 'vitest'

import { UltimaBase } from '@ultimabase/core'

import {
	defineEvent,
	hooksPlugin,
	onEvent,
	type HookRelationChanges,
} from '../src/index.js'

const todoCreated = defineEvent<{ readonly title: string }>('todo.created')

const App = UltimaBase.use(
	hooksPlugin({
		events: [
			onEvent(todoCreated, ({ event }) => {
				expectTypeOf(event.payload.title).toEqualTypeOf<string>()
			}),
		],
		global: {
			afterCommit: {
				all: ({ schema, kind }) => {
					expectTypeOf(schema).toEqualTypeOf<string>()
					expectTypeOf(kind).toEqualTypeOf<
						'create' | 'delete' | 'update' | 'upsert'
					>()
				},
			},
		},
	}),
)

const Tag = App.Schema.define({
	className: 'TypedHookTag',
	fields: (field) => ({ label: field.string({ required: true }) }),
}).with({})

// ADR-0318: hooks see plain data, readable atomic operations and link changes.
test('types every phase on plain data in .with', () => {
	App.Schema.define({
		className: 'TypedHookTodo',
		fields: (field) => ({
			title: field.string({
				required: true,
				hooks: {
					resolveInput: ({ value }) => {
						// Field hooks never receive null.
						expectTypeOf(value).toEqualTypeOf<string>()
						return value.trim()
					},
				},
			}),
			note: field.string({
				hooks: {
					resolveInput: ({ value }) => {
						expectTypeOf(value).toEqualTypeOf<string>()
						return undefined
					},
				},
			}),
			views: field.int({ default: 0, required: true }),
			tags: field.relation({ target: () => Tag }),
		}),
	}).with({
		hooks: {
			resolveInput: {
				create: ({ data }) => {
					expectTypeOf(data.title).toEqualTypeOf<string>()
					return { ...data, title: data.title.trim() }
				},
				update: ({ changes, originalItem }) => {
					expectTypeOf(originalItem.title).toEqualTypeOf<string>()
					expectTypeOf(changes.tags).toEqualTypeOf<
						HookRelationChanges | undefined
					>()
					return changes
				},
				upsert: ({ data, changes, mode }) => {
					expectTypeOf(mode).toEqualTypeOf<'create' | 'update'>()
					return { changes, data }
				},
			},
			beforeOperation: {
				all: ({ kind }) => {
					expectTypeOf(kind).toEqualTypeOf<
						'create' | 'delete' | 'update' | 'upsert'
					>()
				},
				upsert: ({ mode, originalItem }) => {
					expectTypeOf(mode).toEqualTypeOf<'create' | 'update'>()
					expectTypeOf(originalItem?.title).toEqualTypeOf<string | undefined>()
				},
				create: ({ context, item }) => {
					context.emit(todoCreated, { title: item.title })
					// @ts-expect-error -- Events are bound by value (ADR-0318).
					context.emit('todo.created', { title: item.title })
				},
			},
			afterOperation: {
				update: ({ changes, item }) => {
					expectTypeOf(item.views).toEqualTypeOf<number>()
					expectTypeOf(changes.views).toEqualTypeOf<
						| number
						| { readonly increment: number; readonly decrement?: never }
						| { readonly decrement: number; readonly increment?: never }
						| undefined
					>()
				},
			},
			afterCommit: {
				delete: ({ item, originalItem }) => {
					expectTypeOf(item).toEqualTypeOf<null>()
					expectTypeOf(originalItem.id).toEqualTypeOf<string>()
				},
			},
		},
	})
})

test('rejects unknown phases and string events', () => {
	App.Schema.define({
		className: 'TypedHookTypos',
		fields: (field) => ({ title: field.string() }),
	}).with({
		hooks: {
			// @ts-expect-error -- Read hooks do not exist (ADR-0318).
			beforeFind: () => undefined,
		},
	})
})
