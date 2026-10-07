import { expectTypeOf, test } from 'vitest'

import {
	compileValidationPlans,
	UltimaBase,
	snapshotScalarFieldValue,
	type FieldValidationPlan,
} from '@ultimabase/core'

import {
	isVectorFieldValidationPlan,
	pgVectorPlugin,
	vectorField,
	type PgVectorPlugin,
	type VectorFieldValidationPlan,
} from '../src/index.js'

test('narrows shared scalar plans through the public guard', () => {
	const schema = UltimaBase.Schema.define({
		className: 'Document',
		fields: () => ({ embedding: vectorField({ dimensions: 3 }) }),
	})
	const plan = compileValidationPlans(schema).create.fields.embedding
	const configuredPlugin = pgVectorPlugin()

	expectTypeOf(configuredPlugin).toEqualTypeOf<PgVectorPlugin>()
	expectTypeOf(plan).toEqualTypeOf<FieldValidationPlan | undefined>()

	if (plan !== undefined && isVectorFieldValidationPlan(plan)) {
		expectTypeOf(plan).toEqualTypeOf<VectorFieldValidationPlan>()
		expectTypeOf(plan.field.options.dimensions).toEqualTypeOf<number>()
		expectTypeOf(
			snapshotScalarFieldValue(plan.field, [1, 2, 3], 'embedding'),
		).toEqualTypeOf<readonly number[]>()
	}
})
