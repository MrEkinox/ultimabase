import { UltimaBase, dateTimeField } from '@ultimabase/core'
import { command, definePlugin, feature } from '@ultimabase/plugin-kit'
import { expectTypeOf, test } from 'vitest'

import { restPlugin, type RestSchemaRule } from '../src/index.js'

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
test('keys `.with({ rest })` by method and exposable command names', () => {
	defineArchivable().with((plugins) =>
		plugins.rest({ archiveOne: true, findMany: false }),
	)
	define().with((plugins) => plugins.rest(true))
	define().with((plugins) => plugins.rest({ count: true, upsertMany: true }))

	defineArchivable().with((plugins) =>
		// @ts-expect-error -- a command on many rows takes input REST cannot send.
		plugins.rest({ archiveMany: true }),
	)
	defineArchivable().with((plugins) =>
		// @ts-expect-error -- Master commands are never public routes.
		plugins.rest({ purgeOne: true }),
	)
	define().with((plugins) =>
		// @ts-expect-error -- the command exists only after `archivable: true`.
		plugins.rest({ archiveOne: true }),
	)
	define().with((plugins) =>
		// @ts-expect-error -- the former REST-only keys are gone.
		plugins.rest({ find: true }),
	)

	expectTypeOf<RestSchemaRule>().toExtend<
		boolean | Readonly<{ findOne?: boolean; deleteMany?: boolean }>
	>()
})
