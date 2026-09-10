import {
	Schema,
	defineOperationValue,
	defineSchemaMutation,
	type PluginSchemaMutationDefinition,
} from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import type {
	SchemaAccess,
	SchemaAccessOption,
	SchemaMutationAccessIdentity,
} from './index.js'

type ArchiveInput = Readonly<{ readonly reason: string }>

const archive: PluginSchemaMutationDefinition<
	'fixture.access-types.archive',
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
	name: 'fixture.access-types.archive',
	returning: 'after',
	version: '1.0.0',
})

const purge: PluginSchemaMutationDefinition<
	'fixture.access-types.purge',
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
	name: 'fixture.access-types.purge',
	returning: 'before',
	version: '1.0.0',
})

declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedSchemaSurfaces {
		readonly AccessSchemaMutationTypeDocument: {
			readonly schemaMutations: {
				readonly archive: typeof archive
				readonly purge: typeof purge
			}
		}
	}
}

const Document = Schema.define({
	className: 'AccessSchemaMutationTypeDocument',
	fields: (field) => ({ title: field.string() }),
})

test('types exact request-authority schema mutation Access branches', () => {
	const access: SchemaAccess<typeof Document> = {
		archive: {
			allow: ({ input, mutation }) => {
				expectTypeOf(input.reason).toEqualTypeOf<string>()
				expectTypeOf(mutation).toEqualTypeOf<
					SchemaMutationAccessIdentity<typeof archive>
				>()
				return input.reason.length > 0
			},
			item: ({ input, item, originalItem }) => {
				expectTypeOf(input.reason).toEqualTypeOf<string>()
				void item.title
				void originalItem.title
				return true
			},
			where: ({ input, where }) => {
				expectTypeOf(input.reason).toEqualTypeOf<string>()
				return where.eq('title', input.reason)
			},
		},
		delete: false,
		update: false,
	}

	expectTypeOf(access.archive).not.toBeNever()

	const stale: SchemaAccessOption<{
		readonly className: typeof Document.className
	}> = {
		// @ts-expect-error -- Access accepts only exact generated mutation keys.
		stale: true,
	}
	const masterOnly: SchemaAccessOption<{
		readonly className: typeof Document.className
	}> = {
		// @ts-expect-error -- Master-only mutations never enter request Access.
		purge: true,
	}

	void masterOnly
	void stale
	void archive
	void purge
	void Document
})
