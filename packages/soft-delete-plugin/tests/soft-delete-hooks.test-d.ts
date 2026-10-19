import { expectTypeOf, test } from 'vitest'
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'

import { softDeletePlugin } from '../src/index.js'

const App = UltimaBase.use(softDeletePlugin(), hooksPlugin())

const Document = App.Schema.define({
	className: 'TypedSoftDeleteHookDocument',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: { mode: 'command' },
})

// ADR-0347: a plugin operation key covers its One and Many commands.
test('Hooks take the plugin operations of Soft Delete', () => {
	Document.with({
		hooks: {
			beforeOperation: {
				softDelete: ({ originalItem, target }) => {
					expectTypeOf(originalItem.title).toEqualTypeOf<string>()
					expectTypeOf(target.id).toEqualTypeOf<string>()
				},
				restore: ({ item }) => {
					expectTypeOf(item.title).toEqualTypeOf<string>()
				},
			},
			afterOperation: {
				restore: ({ item }) => {
					expectTypeOf(item.isDeleted).toEqualTypeOf<boolean>()
				},
				purge: ({ item }) => {
					expectTypeOf(item).toEqualTypeOf<null>()
				},
			},
			afterCommit: { softDelete: () => undefined },
		},
	})
})

test('Hooks refuse per-method plugin keys and the read and write groups', () => {
	Document.with({
		hooks: {
			afterOperation: {
				// @ts-expect-error -- restoreOne is a method; Hooks take the operation restore.
				restoreOne: () => undefined,
			},
		},
	})
	Document.with({
		hooks: {
			beforeOperation: {
				// @ts-expect-error -- softDeleteMany is a method; Hooks take softDelete.
				softDeleteMany: () => undefined,
			},
		},
	})
	Document.with({
		hooks: {
			beforeOperation: {
				// @ts-expect-error -- There are no read hooks.
				read: () => undefined,
			},
		},
	})
	Document.with({
		hooks: {
			afterCommit: {
				// @ts-expect-error -- Hooks take all or an operation, not the write group.
				write: () => undefined,
			},
		},
	})
})
