import {
	UltimaBase,
	defineOperationValue,
	defineSchemaMutation,
	type PluginSchemaMutationDefinition,
} from '@ultimabase/core'
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

declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedSchemaSurfaces {
		readonly HookSchemaMutationTypeDocument: {
			readonly schemaMutations: {
				readonly archive: typeof archive
				readonly purge: typeof purge
			}
		}
	}
}

test('types exact request and Master schema mutation Hook branches', () => {
	const Document = UltimaBase.Schema.define({
		className: 'HookSchemaMutationTypeDocument',
		fields: (field) => ({ title: field.string() }),
	})
	const hooks: SchemaHooks<typeof Document> = {
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
				expectTypeOf(target.schema).toEqualTypeOf<typeof Document>()
			},
			purge: ({ item }) => {
				expectTypeOf(item).toEqualTypeOf<null>()
			},
		},
	}

	const stale: SchemaHooks<typeof Document> = {
		beforeOperation: {
			// @ts-expect-error -- Hooks accept only exact generated mutation keys.
			stale: () => undefined,
		},
	}

	void stale
	void hooks
	void Document
	void archive
	void purge
})
