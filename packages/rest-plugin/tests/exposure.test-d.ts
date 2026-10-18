import { UltimaBase, dateTimeField } from '@ultimabase/core'
import { command, definePlugin, feature } from '@ultimabase/plugin-kit'
import { expectTypeOf, test } from 'vitest'

import {
	restPlugin,
	type RestMethodRules,
	type RestSchemaRule,
} from '../src/index.js'

const archivePlugin = definePlugin({
	name: '@fixture/rest-archive-types',
	features: {
		archivable: feature({
			fields: { archivedAt: dateTimeField() },
			commands: {
				archiveOne: command({ authority: 'request', effect: 'update' }),
				archiveMany: command({
					authority: 'request',
					effect: 'update',
					target: 'many',
				}),
				purgeOne: command({ authority: 'master', effect: 'delete' }),
			},
		}),
	},
})
const App = UltimaBase.use(archivePlugin).use(restPlugin())
const define = () =>
	App.Schema.define({
		className: 'RestRuleTypes',
		fields: (field) => ({ title: field.string() }),
	})
const defineArchivable = () =>
	App.Schema.define({
		className: 'RestRuleTypes',
		fields: (field) => ({ title: field.string() }),
		archivable: true,
	})

// ADR-0324 decision 2: one vocabulary, the schema method names.
test('keys `.with({ rest: … })` by method and exposable command names', () => {
	defineArchivable().with({ rest: { archiveOne: true, findMany: false } })
	define().with({ rest: true })
	define().with({ rest: { count: true, upsertMany: true } })

	defineArchivable().with({
		// @ts-expect-error -- a command on many rows takes input REST cannot send.
		rest: { archiveMany: true },
	})
	defineArchivable().with({
		// @ts-expect-error -- Master commands are never public routes.
		rest: { purgeOne: true },
	})
	define().with({
		// @ts-expect-error -- the command exists only after `archivable: true`.
		rest: { archiveOne: true },
	})

	expectTypeOf<RestSchemaRule>().toExtend<
		boolean | Readonly<{ findOne?: boolean; deleteMany?: boolean }>
	>()
})

// ADR-0347 decision 2: the rest key takes every level of the vocabulary.
test('keys `.with({ rest: … })` by all, group, operation and method', () => {
	define().with({ rest: { find: true } })
	define().with({ rest: { all: false, read: true, count: false } })
	define().with({ rest: { write: false, create: true, upsert: true } })
	defineArchivable().with({ rest: { write: false, archive: true } })
	defineArchivable().with({
		expose: { write: false },
		rest: { archiveOne: true, delete: true },
	})
	restPlugin({ default: { read: true, write: false, find: true } })

	define().with({
		// @ts-expect-error -- `archive` exists only after `archivable: true`.
		rest: { archive: true },
	})
	define().with({
		// @ts-expect-error -- not a key of the vocabulary.
		rest: { list: true },
	})
	// @ts-expect-error -- plugin commands are named in `.with`, never in `default`.
	restPlugin({ default: { archiveOne: true } })
	expectTypeOf<
		'all' | 'read' | 'write' | 'find' | 'create' | 'delete'
	>().toExtend<keyof RestMethodRules>()
})
