import {
	Schema,
	intField,
	stringField,
	type InferObject,
} from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import type { QueryFilterNode } from '../filters/logical.js'
import type { UpdateExpression } from '../updates/contracts.js'
import type {
	CountOperationAst,
	CreateManyOperationAst,
	CreateOneOperationAst,
	DeleteManyOperationAst,
	DeleteOneOperationAst,
	ExistsOperationAst,
	FindOperationAst,
	FirstOperationAst,
	GetOperationAst,
	UpdateManyOperationAst,
	UpdateOneOperationAst,
	UpsertManyOperationAst,
	UpsertOneOperationAst,
} from './contracts.js'
import type { InferOperationResult } from './results.js'

const schema = new Schema({
	className: 'ResultArticle',
	fields: {
		title: stringField({ validation: { required: true } }),
		views: intField(),
	},
})

interface SelectedResult {
	readonly id: string
	readonly title: string
}
type SelectedFilter = QueryFilterNode<typeof schema>

test('maps every terminal AST to selection-aware singular and bulk results', () => {
	expectTypeOf(schema.className).toEqualTypeOf<'ResultArticle'>()
	expectTypeOf<
		InferOperationResult<
			FindOperationAst<typeof schema, SelectedFilter, 'id' | 'title'>
		>
	>().toEqualTypeOf<readonly SelectedResult[]>()
	expectTypeOf<
		InferOperationResult<
			FirstOperationAst<typeof schema, SelectedFilter, 'id' | 'title'>
		>
	>().toEqualTypeOf<SelectedResult | null>()
	expectTypeOf<
		InferOperationResult<
			GetOperationAst<typeof schema, SelectedFilter, 'id' | 'title'>
		>
	>().toEqualTypeOf<SelectedResult | null>()
	expectTypeOf<
		InferOperationResult<CountOperationAst<typeof schema>>
	>().toEqualTypeOf<number>()
	expectTypeOf<
		InferOperationResult<ExistsOperationAst<typeof schema>>
	>().toEqualTypeOf<boolean>()
	expectTypeOf<
		InferOperationResult<CreateOneOperationAst<typeof schema>>
	>().toEqualTypeOf<InferObject<typeof schema>>()
	expectTypeOf<
		InferOperationResult<CreateManyOperationAst<typeof schema>>
	>().toEqualTypeOf<readonly InferObject<typeof schema>[]>()
	expectTypeOf<
		InferOperationResult<
			UpdateOneOperationAst<
				typeof schema,
				UpdateExpression<typeof schema>,
				SelectedFilter,
				'id' | 'title'
			>
		>
	>().toEqualTypeOf<SelectedResult | null>()
	expectTypeOf<
		InferOperationResult<UpdateManyOperationAst<typeof schema>>
	>().toEqualTypeOf<number>()
	expectTypeOf<
		InferOperationResult<
			UpsertOneOperationAst<
				typeof schema,
				UpdateExpression<typeof schema>,
				SelectedFilter,
				'id' | 'title'
			>
		>
	>().toEqualTypeOf<SelectedResult>()
	expectTypeOf<
		InferOperationResult<UpsertManyOperationAst<typeof schema>>
	>().toEqualTypeOf<readonly InferObject<typeof schema>[]>()
	expectTypeOf<
		InferOperationResult<
			DeleteOneOperationAst<typeof schema, SelectedFilter, 'id' | 'title'>
		>
	>().toEqualTypeOf<SelectedResult | null>()
	expectTypeOf<
		InferOperationResult<DeleteManyOperationAst<typeof schema>>
	>().toEqualTypeOf<number>()
})
