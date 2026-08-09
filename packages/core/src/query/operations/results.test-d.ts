import { Schema, type Pointer, type SchemaResult } from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import type { QueryFilterNode } from '../filters/logical.js'
import type {
	InferQueryRecord,
	InferQueryResult,
	QueryPointerResultInclusion,
} from '../query/result.js'
import type { UpdateExpression } from '../updates/contracts.js'
import type {
	CountOperationAst,
	CreateManyOperationAst,
	CreateOneOperationAst,
	DeleteManyOperationAst,
	DeleteOneOperationAst,
	ExistsOperationAst,
	FindManyOperationAst,
	FindOneOperationAst,
	GetOperationAst,
	OperationIncludedField,
	UpdateManyOperationAst,
	UpdateOneOperationAst,
	UpsertManyOperationAst,
	UpsertOneOperationAst,
} from './contracts.js'
import type {
	InferOperationRecordResult,
	InferOperationResult,
	InferOperationSourceRecordResult,
} from './results.js'

const schema = Schema.define({
	className: 'ResultArticle',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
		views: field.int(),
	}),
})

type SelectedResult = InferQueryResult<typeof schema, 'id' | 'title'>
type SelectedFilter = QueryFilterNode<typeof schema>

test('maps every terminal AST to selection-aware singular and bulk results', () => {
	expectTypeOf(schema.className).toEqualTypeOf<'ResultArticle'>()
	expectTypeOf<
		InferOperationResult<
			FindManyOperationAst<typeof schema, SelectedFilter, 'id' | 'title'>
		>
	>().toEqualTypeOf<readonly SelectedResult[]>()
	expectTypeOf<
		InferOperationResult<
			FindOneOperationAst<typeof schema, SelectedFilter, 'id' | 'title'>
		>
	>().toEqualTypeOf<SelectedResult | null>()
	expectTypeOf<
		InferOperationResult<
			GetOperationAst<typeof schema, SelectedFilter, 'id' | 'title'>
		>
	>().toEqualTypeOf<SelectedResult>()
	expectTypeOf<
		InferOperationResult<CountOperationAst<typeof schema>>
	>().toEqualTypeOf<number>()
	expectTypeOf<
		InferOperationResult<ExistsOperationAst<typeof schema>>
	>().toEqualTypeOf<boolean>()
	expectTypeOf<
		InferOperationResult<CreateOneOperationAst<typeof schema>>
	>().toEqualTypeOf<SchemaResult<typeof schema>>()
	expectTypeOf<
		InferOperationResult<CreateManyOperationAst<typeof schema>>
	>().toEqualTypeOf<readonly SchemaResult<typeof schema>[]>()
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
		InferOperationResult<
			UpdateManyOperationAst<
				typeof schema,
				UpdateExpression<typeof schema>,
				SelectedFilter,
				'id' | 'title'
			>
		>
	>().toEqualTypeOf<readonly SelectedResult[]>()
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
	>().toEqualTypeOf<readonly SchemaResult<typeof schema>[]>()
	expectTypeOf<
		InferOperationResult<
			DeleteOneOperationAst<typeof schema, SelectedFilter, 'id' | 'title'>
		>
	>().toEqualTypeOf<SelectedResult | null>()
	expectTypeOf<
		InferOperationResult<
			DeleteManyOperationAst<typeof schema, SelectedFilter, 'id' | 'title'>
		>
	>().toEqualTypeOf<readonly SelectedResult[]>()
})

test('distinguishes adapter pointers from hydrated Runtime inclusions', () => {
	const user = Schema.define({
		className: 'ResultIncludedUser',
		fields: (field) => ({
			name: field.string({ validation: { required: true } }),
		}),
	})
	const post = Schema.define({
		className: 'ResultIncludedPost',
		fields: (field) => ({
			author: field.pointer({
				target: () => user,
				validation: { required: true },
			}),
			title: field.string({ validation: { required: true } }),
		}),
	})
	type Inclusion = QueryPointerResultInclusion<'author', typeof user, 'name'>
	type Operation = FindManyOperationAst<
		typeof post,
		QueryFilterNode<typeof post>,
		'author' | 'title',
		Inclusion
	>
	expectTypeOf(post.className).toEqualTypeOf<'ResultIncludedPost'>()

	expectTypeOf<InferOperationSourceRecordResult<Operation>>().toEqualTypeOf<
		readonly InferQueryRecord<typeof post, 'author' | 'title'>[]
	>()
	expectTypeOf<InferOperationRecordResult<Operation>>().toEqualTypeOf<
		readonly InferQueryRecord<typeof post, 'author' | 'title', Inclusion>[]
	>()
	expectTypeOf<OperationIncludedField<Operation>>().toEqualTypeOf<Inclusion>()
	expectTypeOf<
		InferQueryRecord<typeof post, 'author'>['author']
	>().toEqualTypeOf<Pointer<typeof user>>()
})
