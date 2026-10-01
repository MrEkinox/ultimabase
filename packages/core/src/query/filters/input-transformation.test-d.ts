import { expectTypeOf, test } from 'vitest'

import {
	transformQueryFilterInput,
	type GenericField,
	type QueryFilterOperandInput,
	type QueryFilterOperandSource,
} from '../../index.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

test('exports one precisely typed transport operand boundary', () => {
	const Article = UltimaBase.Schema.define({
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
