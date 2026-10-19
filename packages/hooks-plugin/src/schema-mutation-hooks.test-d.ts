import { UltimaBase } from '@ultimabase/core'
import {
	defineOperationValue,
	defineSchemaMutation,
	type PluginSchemaMutationDefinition,
	type SchemaCommands,
} from '@ultimabase/core/plugin'
import { expectTypeOf, test } from 'vitest'

import type { SchemaHooks, SchemaMutationHookIdentity } from './index.js'

type ArchiveInput = Readonly<{ readonly reason: string }>

const archive: PluginSchemaMutationDefinition<
	'fixture.hook-types.archive',
	'1.0.0',
	ArchiveInput,
	readonly [],
	'request',
	'update',
	'after',
	Readonly<Record<never, never>>
> = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	input: defineOperationValue((value) => value as ArchiveInput),
	name: 'fixture.hook-types.archive',
	returning: 'after',
	version: '1.0.0',
})

const purge: PluginSchemaMutationDefinition<
	'fixture.hook-types.purge',
	'1.0.0',
	undefined,
	readonly [],
	'master',
	'delete',
	'before',
	Readonly<Record<never, never>>
> = defineSchemaMutation({
	authority: 'master',
	effect: 'delete',
	input: defineOperationValue((value): undefined => value as undefined),
	name: 'fixture.hook-types.purge',
	returning: 'before',
	version: '1.0.0',
})

test('types exact request and Master schema mutation Hook branches', () => {
	const Base = UltimaBase.Schema.define({
		className: 'HookSchemaMutationTypeDocument',
		fields: (field) => ({ title: field.string() }),
	})
	// A plugin statics slot types the commands of a configured schema
	// (ADR-0316); Hooks key them by operation (ADR-0347).
	type Document = typeof Base &
		SchemaCommands<
			typeof Base,
			{ readonly archiveOne: typeof archive; readonly purgeOne: typeof purge }
		>
	const hooks: SchemaHooks<Document> = {
		afterOperation: {
			archive: ({ input, item, mutation, originalItem, target }) => {
				expectTypeOf(input.reason).toEqualTypeOf<string>()
				void item.title
				expectTypeOf(mutation).toEqualTypeOf<
					SchemaMutationHookIdentity<typeof archive>
				>()
				void originalItem.title
				expectTypeOf(target.id).toEqualTypeOf<string>()
			},
			purge: ({ input, item, mutation }) => {
				expectTypeOf(input).toEqualTypeOf<undefined>()
				expectTypeOf(item).toEqualTypeOf<null>()
				expectTypeOf(mutation.authority).toEqualTypeOf<'master'>()
			},
		},
		beforeOperation: {
			archive: ({ context, input, item, originalItem, target }) => {
				void context.requestId
				void input.reason
				void item.title
				void originalItem.title
				expectTypeOf(target.schema).toEqualTypeOf<Document>()
			},
			purge: ({ item }) => {
				expectTypeOf(item).toEqualTypeOf<null>()
			},
		},
	}

	const stale: SchemaHooks<Document> = {
		beforeOperation: {
			// @ts-expect-error -- Hooks accept only the schema's command keys.
			stale: () => undefined,
		},
	}

	void stale
	void hooks
	void Base
	void archive
	void purge
})
