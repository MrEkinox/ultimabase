import { Schema, type InferCreateInput } from '../../schema/index.js'
import { expect, expectTypeOf, test } from 'vitest'

import {
	QueryBuilder,
	type CreateManyOperationAst,
	type CreateOneOperationAst,
	type GetOperationAst,
	type OperationAst,
	type OperationKind,
	type UpdateExpressionNode,
	type UpdateManyOperationAst,
	type UpdateOneOperationAst,
	type UpsertManyOperationAst,
	type UpsertOneOperationAst,
} from '../index.js'

const articleSchema = Schema.define({
	className: 'Article',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
		views: field.int(),
		slug: field.string({ immutable: true }),
	}),
})

interface FixtureUpdateExpression extends UpdateExpressionNode {
	readonly kind: 'fixture-update'
	readonly fields: { readonly title?: string }
}

type FixtureOperation = OperationAst<
	typeof articleSchema,
	FixtureUpdateExpression
>

test('preserves exact operation kinds and schema-derived inputs', () => {
	expectTypeOf<OperationKind>().toEqualTypeOf<
		| 'find-many'
		| 'find-one'
		| 'get'
		| 'count'
		| 'exists'
		| 'create-one'
		| 'create-many'
		| 'update-one'
		| 'update-many'
		| 'upsert-one'
		| 'upsert-many'
		| 'delete-one'
		| 'delete-many'
	>()
	expectTypeOf<
		CreateOneOperationAst<typeof articleSchema>['input']
	>().toEqualTypeOf<InferCreateInput<typeof articleSchema>>()
	expectTypeOf<
		CreateManyOperationAst<typeof articleSchema>['inputs']
	>().toEqualTypeOf<readonly InferCreateInput<typeof articleSchema>[]>()
	expectTypeOf<
		GetOperationAst<typeof articleSchema>['id']
	>().toEqualTypeOf<string>()

	const createOperation: CreateOneOperationAst<typeof articleSchema> = {
		kind: 'create-one',
		selection: { fields: [], kind: 'selection' },
		schema: new QueryBuilder(articleSchema).ast.schema,
		input: { title: 'Typed operation' },
	}

	expect(createOperation.kind).toBe('create-one')

	const invalidCreate: CreateOneOperationAst<typeof articleSchema> = {
		kind: 'create-one',
		selection: { fields: [], kind: 'selection' },
		schema: new QueryBuilder(articleSchema).ast.schema,
		// @ts-expect-error -- Required create fields remain required in Operation AST.
		input: {},
	}

	expect(invalidCreate.kind).toBe('create-one')
})

test('keeps update expressions separate from creation inputs', () => {
	type UpdateOne = UpdateOneOperationAst<
		typeof articleSchema,
		FixtureUpdateExpression
	>
	type UpdateMany = UpdateManyOperationAst<
		typeof articleSchema,
		FixtureUpdateExpression
	>
	type UpsertOne = UpsertOneOperationAst<
		typeof articleSchema,
		FixtureUpdateExpression
	>
	type UpsertMany = UpsertManyOperationAst<
		typeof articleSchema,
		FixtureUpdateExpression
	>

	expectTypeOf<UpdateOne['update']>().toEqualTypeOf<FixtureUpdateExpression>()
	expectTypeOf<UpdateMany['update']>().toEqualTypeOf<FixtureUpdateExpression>()
	expectTypeOf<'input'>().not.toExtend<keyof UpdateOne>()
	expectTypeOf<UpsertOne['create']>().toEqualTypeOf<
		InferCreateInput<typeof articleSchema>
	>()
	expectTypeOf<UpsertOne['update']>().toEqualTypeOf<FixtureUpdateExpression>()
	expectTypeOf<UpsertMany['items'][number]['create']>().toEqualTypeOf<
		InferCreateInput<typeof articleSchema>
	>()
	expectTypeOf<
		UpsertMany['items'][number]['update']
	>().toEqualTypeOf<FixtureUpdateExpression>()
})

test('keeps bulk atomicity intrinsic to the operation contract', () => {
	expectTypeOf<'options'>().not.toExtend<
		keyof CreateManyOperationAst<typeof articleSchema>
	>()
	expectTypeOf<'options'>().not.toExtend<
		keyof UpsertManyOperationAst<typeof articleSchema>
	>()
})

test('forces exhaustive matching when a terminal kind is added', () => {
	const classify = (
		operation: FixtureOperation,
	): 'bulk' | 'read' | 'singular' => {
		switch (operation.kind) {
			case 'find-many':
			case 'find-one':
			case 'get':
			case 'count':
			case 'exists':
				return 'read'
			case 'create-one':
			case 'update-one':
			case 'upsert-one':
			case 'delete-one':
				return 'singular'
			case 'create-many':
			case 'update-many':
			case 'upsert-many':
			case 'delete-many':
				return 'bulk'
			default:
				expectTypeOf(operation).toEqualTypeOf<never>()
				return operation
		}
	}

	expectTypeOf(classify).returns.toEqualTypeOf<'bulk' | 'read' | 'singular'>()
})
