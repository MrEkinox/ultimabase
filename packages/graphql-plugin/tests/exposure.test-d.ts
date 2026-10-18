import { UltimaBase, dateTimeField } from '@ultimabase/core'
import { command, definePlugin, feature } from '@ultimabase/plugin-kit'
import { expectTypeOf, test } from 'vitest'

import {
	graphqlPlugin,
	type GraphqlMethodName,
	type GraphqlMethodRules,
} from '../src/index.js'

const archivePlugin = definePlugin({
	name: '@fixture/graphql-archive-types',
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
const App = UltimaBase.use(archivePlugin).use(graphqlPlugin())
const define = () =>
	App.Schema.define({
		className: 'GraphqlRuleTypes',
		fields: (field) => ({ title: field.string() }),
	})
const defineArchivable = () =>
	App.Schema.define({
		className: 'GraphqlRuleTypes',
		fields: (field) => ({ title: field.string() }),
		archivable: true,
	})

// ADR-0347 decision 2: the graphql key takes every level of the vocabulary.
test('keys `.with({ graphql: … })` by all, group, operation and method', () => {
	define().with({ graphql: { find: true, typeName: 'Rule' } })
	define().with({ graphql: { all: false, read: true, count: false } })
	define().with({ graphql: { write: false, create: true, upsert: true } })
	defineArchivable().with({ graphql: { write: false, archive: true } })
	defineArchivable().with({
		expose: { write: false },
		graphql: { archiveOne: true, delete: true },
	})
	graphqlPlugin({ default: { read: true, write: false, find: true } })

	defineArchivable().with({
		// @ts-expect-error -- a command on many rows is never exposed.
		graphql: { archiveMany: true },
	})
	defineArchivable().with({
		// @ts-expect-error -- Master commands are never public fields.
		graphql: { purgeOne: true },
	})
	define().with({
		// @ts-expect-error -- `archive` exists only after `archivable: true`.
		graphql: { archive: true },
	})
	define().with({
		// @ts-expect-error -- not a key of the vocabulary.
		graphql: { list: true },
	})
	// @ts-expect-error -- plugin commands are named in `.with`, never in `default`.
	graphqlPlugin({ default: { archiveOne: true } })
	expectTypeOf<
		| 'all'
		| 'read'
		| 'write'
		| 'find'
		| 'create'
		| 'update'
		| 'upsert'
		| 'delete'
	>().toExtend<keyof GraphqlMethodRules>()
	// The method names stay the twelve schema methods.
	expectTypeOf<GraphqlMethodName>().toEqualTypeOf<
		| 'findMany'
		| 'findOne'
		| 'count'
		| 'exists'
		| 'createOne'
		| 'createMany'
		| 'updateOne'
		| 'updateMany'
		| 'upsertOne'
		| 'upsertMany'
		| 'deleteOne'
		| 'deleteMany'
	>()
})
