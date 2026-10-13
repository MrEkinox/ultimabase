import { expectTypeOf, test } from 'vitest'

import {
	type SchemaItem,
	type SchemaOutput,
	type VirtualFieldResolver,
} from '../../index.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

test('types bootstrap virtual declarations', () => {
	const Virtual = UltimaBase.Schema.define({
		className: 'BootstrapVirtualType',
		fields: (field) => ({
			name: field.string({ required: true }),
			displayName: field.virtual({
				output: (output) => output.string({ nullable: false }),
				resolve: ({ item, context }) => {
					expectTypeOf(item.id).toEqualTypeOf<string>()
					expectTypeOf(context.source).toEqualTypeOf<string>()
					return Promise.resolve(String(item.name))
				},
				select: { name: true },
			}),
		}),
	})

	expectTypeOf(Virtual.fields.displayName).not.toBeAny()
	expectTypeOf<SchemaItem<typeof Virtual>>().not.toBeAny()
	expectTypeOf<SchemaOutput<typeof Virtual>>().not.toBeAny()
})

test('rejects stored options and incompatible resolver results', () => {
	UltimaBase.Schema.define({
		className: 'InvalidBootstrapVirtualType',
		fields: (field) => ({
			invalidOptions: field.virtual({
				output: (output) => output.string(),
				resolve: () => null,
				select: { id: true },
				// @ts-expect-error -- Stored requiredness belongs to persisted fields.
				required: true,
			}),
			invalidResult: field.virtual({
				output: (output) => output.int({ nullable: false }),
				// @ts-expect-error -- Resolver values must match the output descriptor.
				resolve: () => 'not-an-int',
				select: { id: true },
			}),
		}),
	})

	expectTypeOf<
		VirtualFieldResolver<{ readonly id: string }, number>
	>().toBeFunction()
})
