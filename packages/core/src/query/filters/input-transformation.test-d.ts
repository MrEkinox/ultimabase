import { expectTypeOf, test } from 'vitest'

import {
	Schema,
	transformQueryFilterInput,
	type GenericField,
	type QueryFilterOperandInput,
	type QueryFilterOperandSource,
} from '../../index.js'

test('exports one precisely typed transport operand boundary', () => {
	const Article = Schema.define({
		className: 'FilterTransformationTypeArticle',
		fields: (field) => ({ title: field.string() }),
	})
	const transformed = transformQueryFilterInput(
		Article,
		{ title: { eq: 'wire value' } },
		(input) => {
			expectTypeOf(input).toEqualTypeOf<QueryFilterOperandInput>()
			expectTypeOf(input.field).toEqualTypeOf<GenericField>()
			expectTypeOf(input.operator).toEqualTypeOf<string>()
			expectTypeOf(input.source).toEqualTypeOf<QueryFilterOperandSource>()
			expectTypeOf(input.value).toEqualTypeOf<unknown>()
			return input.value
		},
	)

	expectTypeOf(transformed).toEqualTypeOf<unknown>()
})
