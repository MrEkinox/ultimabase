import { expectTypeOf, test } from 'vitest'

import {
	compileValidationPlans,
	createApplication,
	Schema,
	type FieldValidationPlan,
} from '@ultimabase/core'

import {
	pgVectorPlugin,
	vectorField,
	type PgVectorPlugin,
	type PgVectorPluginExports,
	type VectorFieldValidationPlan,
} from '../src/index.js'

test('narrows shared scalar plans through the plugin handler', async () => {
	const schema = Schema.define({
		className: 'Document',
		fields: { embedding: vectorField({ dimensions: 3 }) },
	})
	const plan = compileValidationPlans(schema).create.fields.embedding
	const configuredPlugin = pgVectorPlugin()
	const application = await createApplication({
		plugins: [configuredPlugin],
		schemas: [schema],
	})
	const plugin = application.getPlugin('pg-vector')

	expectTypeOf(configuredPlugin).toEqualTypeOf<PgVectorPlugin>()
	expectTypeOf(plugin).toEqualTypeOf<Readonly<PgVectorPluginExports>>()
	expectTypeOf(plan).toEqualTypeOf<FieldValidationPlan | undefined>()

	if (plan !== undefined && plugin.handles(plan)) {
		expectTypeOf(plan).toEqualTypeOf<VectorFieldValidationPlan>()
		expectTypeOf(plan.field.options.dimensions).toEqualTypeOf<number>()
		expectTypeOf(plugin.validate([1, 2, 3], plan)).toEqualTypeOf<
			readonly number[]
		>()
	}
})
