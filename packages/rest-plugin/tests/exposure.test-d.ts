import { UltimaBase, dateTimeField } from '@ultimabase/core'
import { command, definePlugin, shapeMethod } from '@ultimabase/plugin-kit'
import { expectTypeOf, test } from 'vitest'

import { restPlugin, type RestSchemaRule } from '../src/index.js'

const archivePlugin = definePlugin({
	name: '@fixture/rest-archive-types',
	shape: {
		archivable: shapeMethod({
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

// ADR-0324 decision 2: one vocabulary, the schema method names.
test('keys `.with({ rest })` by method and exposable command names', () => {
	define()
		.archivable()
		.with({ rest: { archiveOne: true, findMany: false } })
	define().with({ rest: true })
	define().with({ rest: { count: true, upsertMany: true } })

	define()
		.archivable()
		// @ts-expect-error -- a command on many rows takes input REST cannot send.
		.with({ rest: { archiveMany: true } })
	define()
		.archivable()
		// @ts-expect-error -- Master commands are never public routes.
		.with({ rest: { purgeOne: true } })
	// @ts-expect-error -- the command exists only after `.archivable()`.
	define().with({ rest: { archiveOne: true } })
	// @ts-expect-error -- the former REST-only keys are gone.
	define().with({ rest: { find: true } })

	expectTypeOf<RestSchemaRule>().toExtend<
		boolean | Readonly<{ findOne?: boolean; deleteMany?: boolean }>
	>()
})
