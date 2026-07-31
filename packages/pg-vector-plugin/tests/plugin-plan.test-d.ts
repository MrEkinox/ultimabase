import { expectTypeOf, test } from 'vitest'

import {
	compileValidationPlans,
	defineSchema,
	type FieldValidationPlan,
} from '@ultimabase/schema'

import {
	pgVectorPlugin,
	vectorField,
	type PgVectorPluginDefinition,
	type VectorFieldValidationPlan,
} from '../src/index.js'

test('narrows opaque plans through the plugin handler', () => {
	const schema = defineSchema({
		className: 'Document',
		fields: { embedding: vectorField({ dimensions: 3 }) },
	})
	const plan = compileValidationPlans(schema).create.fields.embedding
	const plugin = pgVectorPlugin()

	expectTypeOf(plugin).toEqualTypeOf<Readonly<PgVectorPluginDefinition>>()
	expectTypeOf(plan).toEqualTypeOf<FieldValidationPlan | undefined>()

	if (plan !== undefined && plugin.handles(plan)) {
		expectTypeOf(plan).toEqualTypeOf<VectorFieldValidationPlan>()
		expectTypeOf(plan.field.options.dimensions).toEqualTypeOf<number>()
		expectTypeOf(plugin.validate([1, 2, 3], plan)).toEqualTypeOf<
			readonly number[]
		>()
	}
})
