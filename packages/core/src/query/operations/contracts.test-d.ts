import {
	Schema,
	intField,
	stringField,
	type InferCreateInput,
	type SchemaResult,
} from '../../schema/index.js'
import { expect, expectTypeOf, test } from 'vitest'

import {
	Query,
	type AtomicBulkOperationOptions,
	type BulkOperationResult,
	type CreateManyOperationAst,
	type CreateOneOperationAst,
	type GetOperationAst,
	type OperationAst,
	type OperationKind,
	type NonAtomicBulkResult,
	type UpdateExpressionNode,
	type UpdateManyOperationAst,
	type UpdateOneOperationAst,
	type UpsertManyOperationAst,
	type UpsertOneOperationAst,
} from '../index.js'

const articleSchema = Schema.define({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
		views: intField(),
		slug: stringField({ immutable: true }),
	},
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
		| 'find'
		| 'first'
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
		schema: new Query(articleSchema).ast.schema,
		input: { title: 'Typed operation' },
	}

	expect(createOperation.kind).toBe('create-one')

	const invalidCreate: CreateOneOperationAst<typeof articleSchema> = {
		kind: 'create-one',
		selection: { fields: [], kind: 'selection' },
		schema: new Query(articleSchema).ast.schema,
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

test('keeps master authority outside operation options', () => {
	expectTypeOf<keyof AtomicBulkOperationOptions>().toEqualTypeOf<'atomic'>()

	const validOptions: AtomicBulkOperationOptions = { atomic: true }
	const invalidOptions: AtomicBulkOperationOptions = {
		atomic: true,
		// @ts-expect-error -- Authority belongs to trusted RequestContext creation.
		useMasterKey: true,
	}

	expect(validOptions.atomic).toBe(true)
	expect(invalidOptions.atomic).toBe(true)
})

test('correlates the bulk result with the normalized atomic literal', () => {
	type Article = SchemaResult<typeof articleSchema>

	expectTypeOf<BulkOperationResult<Article, true>>().toEqualTypeOf<
		readonly Article[]
	>()
	expectTypeOf<BulkOperationResult<Article, false>>().toEqualTypeOf<
		NonAtomicBulkResult<Article>
	>()
	expectTypeOf<
		CreateManyOperationAst<typeof articleSchema, false>['options']['atomic']
	>().toEqualTypeOf<false>()
})

test('forces exhaustive matching when a terminal kind is added', () => {
	const classify = (
		operation: FixtureOperation,
	): 'bulk' | 'read' | 'singular' => {
		switch (operation.kind) {
			case 'find':
			case 'first':
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
