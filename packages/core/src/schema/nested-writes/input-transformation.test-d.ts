import { expectTypeOf, test } from 'vitest'

import {
	transformSchemaMutationDataInput,
	type GenericField,
	type SchemaMutationDataFieldInput,
} from '../../index.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

test('exports one precisely typed mutation field boundary', () => {
	const Article = UltimaBase.Schema.define({
		className: 'MutationTransformationTypeArticle',
		fields: (field) => ({ title: field.string() }),
	})
	const transformed = transformSchemaMutationDataInput(
		Article,
		{ title: 'wire value' },
		{
			mode: 'create',
			relationships: 'flat',
			transformField: (input) => {
				expectTypeOf(input).toEqualTypeOf<SchemaMutationDataFieldInput>()
				expectTypeOf(input.field).toEqualTypeOf<GenericField | undefined>()
				expectTypeOf(input.kind).toEqualTypeOf<
					'persisted' | 'unknown' | 'virtual'
				>()
				expectTypeOf(input.value).toEqualTypeOf<unknown>()
				return input.value
			},
		},
	)

	expectTypeOf(transformed).toEqualTypeOf<unknown>()
})
