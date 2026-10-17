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
				output: (output) => output.string(),
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
				output: (output) => output.string({ required: false }),
				resolve: () => null,
				select: { id: true },
				// @ts-expect-error -- Stored requiredness belongs to persisted fields.
				required: true,
			}),
			invalidResult: field.virtual({
				output: (output) => output.int(),
				// @ts-expect-error -- Resolver values must match the output descriptor.
				resolve: () => 'not-an-int',
				select: { id: true },
			}),
			// ADR-0340: an output without `required: false` is non-null.
			nullResult: field.virtual({
				output: (output) => output.string(),
				// @ts-expect-error -- A non-null output rejects a null resolver value.
				resolve: () => null,
				select: { id: true },
			}),
		}),
	})

	expectTypeOf<
		VirtualFieldResolver<{ readonly id: string }, number>
	>().toBeFunction()
})
