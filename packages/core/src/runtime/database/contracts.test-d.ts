import type { ServiceToken } from '../../foundation.js'
import {
	Query,
	type CountOperationAst,
	type CreateManyOperationAst,
	type CreateOneOperationAst,
	type DeleteManyOperationAst,
	type DeleteOneOperationAst,
	type ExistsOperationAst,
	type FindOperationAst,
	type FirstOperationAst,
	type GetOperationAst,
	type UpdateManyOperationAst,
	type UpdateOneOperationAst,
	type UpsertManyOperationAst,
	type UpsertOneOperationAst,
} from '../../query/index.js'
import {
	Schema,
	intField,
	stringField,
	type InferObject,
} from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import {
	databaseAdapterServiceToken,
	databasePointerCapability,
	databasePointerCapabilityVersion,
	databasePointerInclusionCapability,
	databasePointerInclusionCapabilityVersion,
	databaseRelationCapability,
	databaseRelationCapabilityVersion,
	type DatabaseConstraintNode,
	type DatabaseAdapter,
	type DatabaseAdapterCapabilities,
	type DatabaseCreateMaterialization,
	type DatabaseDeleteMaterialization,
	type DatabaseLogicalRecord,
	type DatabaseMutationLogicalRecord,
	type DatabaseMutationMaterialization,
	type DatabaseMutationOperationKind,
	type DatabaseObjectRecord,
	type DatabaseOperationOutcome,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabasePointerCapability,
	type DatabasePointerInclusionCapability,
	type DatabaseRelationCapability,
	type DatabaseRelationScope,
	type DatabaseTransactionAdapter,
	type DatabaseUpdateMaterialization,
	type PreparedDatabaseOperation,
} from './contracts.js'

const articleSchema = Schema.define({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
		views: intField(),
	},
})

type ArticleRecord = DatabaseObjectRecord<typeof articleSchema>
type ArticleLogicalRecord = InferObject<typeof articleSchema>

declare const adapter: DatabaseAdapter

test('maps every operation kind to its database result semantics', () => {
	expectTypeOf<
		DatabaseOperationResult<FindOperationAst<typeof articleSchema>>
	>().toEqualTypeOf<readonly ArticleRecord[]>()
	expectTypeOf<
		DatabaseOperationResult<FirstOperationAst<typeof articleSchema>>
	>().toEqualTypeOf<ArticleRecord | null>()
	expectTypeOf<
		DatabaseOperationResult<GetOperationAst<typeof articleSchema>>
	>().toEqualTypeOf<ArticleRecord | null>()
	expectTypeOf<
		DatabaseOperationResult<CountOperationAst<typeof articleSchema>>
	>().toEqualTypeOf<number>()
	expectTypeOf<
		DatabaseOperationResult<ExistsOperationAst<typeof articleSchema>>
	>().toEqualTypeOf<boolean>()
	expectTypeOf<
		DatabaseOperationResult<CreateOneOperationAst<typeof articleSchema>>
	>().toEqualTypeOf<ArticleRecord>()
	expectTypeOf<
		DatabaseOperationResult<CreateManyOperationAst<typeof articleSchema>>
	>().toEqualTypeOf<readonly ArticleRecord[]>()
	expectTypeOf<
		DatabaseOperationResult<UpdateOneOperationAst<typeof articleSchema>>
	>().toEqualTypeOf<ArticleRecord | null>()
	expectTypeOf<
		DatabaseOperationResult<UpdateManyOperationAst<typeof articleSchema>>
	>().toEqualTypeOf<readonly ArticleRecord[]>()
	expectTypeOf<
		DatabaseOperationResult<UpsertOneOperationAst<typeof articleSchema>>
	>().toEqualTypeOf<ArticleRecord>()
	expectTypeOf<
		DatabaseOperationResult<UpsertManyOperationAst<typeof articleSchema>>
	>().toEqualTypeOf<readonly ArticleRecord[]>()
	expectTypeOf<
		DatabaseOperationResult<DeleteOneOperationAst<typeof articleSchema>>
	>().toEqualTypeOf<ArticleRecord | null>()
	expectTypeOf<
		DatabaseOperationResult<DeleteManyOperationAst<typeof articleSchema>>
	>().toEqualTypeOf<readonly ArticleRecord[]>()
})

test('preserves operation and constraint inference through execute', () => {
	type TenantConstraint = DatabaseConstraintNode<
		'fixture.tenant',
		1,
		Readonly<{ readonly tenantId: string }>
	>

	const operation = {
		kind: 'find',
		query: new Query(articleSchema).where((where) => where.eq('views', 10)).ast,
	} satisfies FindOperationAst<typeof articleSchema>
	const relation = {
		fieldPath: ['relatedArticles'],
		source: articleSchema,
		sourceObjectId: '0198f090-2a50-7000-8000-000000000072',
		target: articleSchema,
	} satisfies DatabaseRelationScope
	const request = {
		constraints: [
			{ kind: 'fixture.tenant', version: 1, payload: { tenantId: 'tenant-1' } },
		],
		operation,
		relation,
	} satisfies DatabaseOperationRequest<typeof operation, TenantConstraint>
	expectTypeOf(adapter.execute(request)).toEqualTypeOf<
		Promise<readonly ArticleRecord[]>
	>()
	expectTypeOf<
		(typeof request.constraints)[number]['payload']['tenantId']
	>().toBeString()
	expectTypeOf(request.relation.source).toEqualTypeOf<typeof articleSchema>()
	expectTypeOf<DatabaseOperationRequest['relation']>().toEqualTypeOf<
		DatabaseRelationScope | undefined
	>()
	expectTypeOf(databaseAdapterServiceToken).toEqualTypeOf<
		ServiceToken<DatabaseAdapter>
	>()
})

test('distinguishes root and transaction adapter capabilities', () => {
	expectTypeOf(
		databasePointerCapability,
	).toEqualTypeOf<DatabasePointerCapability>()
	expectTypeOf(databasePointerCapabilityVersion).toEqualTypeOf<1>()
	expectTypeOf(
		databasePointerInclusionCapability,
	).toEqualTypeOf<DatabasePointerInclusionCapability>()
	expectTypeOf(databasePointerInclusionCapabilityVersion).toEqualTypeOf<1>()
	expectTypeOf(
		databaseRelationCapability,
	).toEqualTypeOf<DatabaseRelationCapability>()
	expectTypeOf(databaseRelationCapabilityVersion).toEqualTypeOf<1>()
	expectTypeOf<DatabaseAdapterCapabilities['pointers']>().toEqualTypeOf<
		DatabasePointerCapability | undefined
	>()
	expectTypeOf<
		DatabaseAdapterCapabilities['pointerInclusions']
	>().toEqualTypeOf<DatabasePointerInclusionCapability | undefined>()
	expectTypeOf<DatabaseAdapterCapabilities['relations']>().toEqualTypeOf<
		DatabaseRelationCapability | undefined
	>()
	expectTypeOf<DatabaseAdapter['kind']>().toEqualTypeOf<'database-adapter'>()
	expectTypeOf<
		DatabaseTransactionAdapter['kind']
	>().toEqualTypeOf<'database-transaction-adapter'>()
	expectTypeOf<'beginTransaction'>().toExtend<keyof DatabaseAdapter>()
	expectTypeOf<'beginTransaction'>().not.toExtend<
		keyof DatabaseTransactionAdapter
	>()
	expectTypeOf<'commit'>().toExtend<keyof DatabaseTransactionAdapter>()
	expectTypeOf<'rollback'>().toExtend<keyof DatabaseTransactionAdapter>()
	expectTypeOf<'prepare'>().toExtend<keyof DatabaseTransactionAdapter>()
	expectTypeOf<'prepare'>().not.toExtend<keyof DatabaseAdapter>()
})

test('keeps prepared outcomes correlated with their exact operation result', () => {
	const operation = {
		input: { title: 'Prepared' },
		kind: 'create-one',
		selection: { fields: [], kind: 'selection' },
		schema: new Query(articleSchema).ast.schema,
	} satisfies CreateOneOperationAst<typeof articleSchema>
	const transaction = null as unknown as DatabaseTransactionAdapter

	expectTypeOf(
		transaction.prepare({ constraints: [], operation }),
	).toEqualTypeOf<Promise<PreparedDatabaseOperation<typeof operation>>>()
	expectTypeOf<
		DatabaseOperationOutcome<typeof operation>['result']
	>().toEqualTypeOf<ArticleRecord>()
	expectTypeOf<
		Awaited<ReturnType<PreparedDatabaseOperation<typeof operation>['execute']>>
	>().toEqualTypeOf<DatabaseOperationOutcome<typeof operation>>()
})

test('models immutable logical create, update, and delete materializations', () => {
	const record = null as unknown as DatabaseLogicalRecord
	const create = null as unknown as DatabaseCreateMaterialization
	const update = null as unknown as DatabaseUpdateMaterialization
	const remove = null as unknown as DatabaseDeleteMaterialization
	const materialization = null as unknown as DatabaseMutationMaterialization
	type CreateMaterializations = DatabaseOperationOutcome<
		CreateOneOperationAst<typeof articleSchema>
	>['materializations']

	expectTypeOf(create.kind).toEqualTypeOf<'create'>()
	expectTypeOf(create.current).toEqualTypeOf<DatabaseLogicalRecord>()
	expectTypeOf(update.kind).toEqualTypeOf<'update'>()
	expectTypeOf(update.previous).toEqualTypeOf<DatabaseLogicalRecord>()
	expectTypeOf(update.current).toEqualTypeOf<DatabaseLogicalRecord>()
	expectTypeOf(remove.kind).toEqualTypeOf<'delete'>()
	expectTypeOf(remove.previous).toEqualTypeOf<DatabaseLogicalRecord>()
	expectTypeOf(materialization.kind).toEqualTypeOf<
		'create' | 'update' | 'delete'
	>()

	// @ts-expect-error -- Adapter snapshots are immutable at the Core boundary.
	record.id = 'other-id'
	expectTypeOf<'push'>().not.toExtend<keyof CreateMaterializations>()
})

test('narrows preparation and materializations by mutation terminal', () => {
	type CreateOperation = CreateOneOperationAst<typeof articleSchema>
	type UpdateOperation = UpdateOneOperationAst<typeof articleSchema>
	type DeleteOperation = DeleteOneOperationAst<typeof articleSchema>
	type DeleteManyOperation = DeleteManyOperationAst<typeof articleSchema>
	type UpsertOperation = UpsertOneOperationAst<typeof articleSchema>
	type UpdateManyOperation = UpdateManyOperationAst<typeof articleSchema>

	expectTypeOf<DatabaseMutationOperationKind>().toEqualTypeOf<
		| 'create-many'
		| 'create-one'
		| 'delete-many'
		| 'delete-one'
		| 'update-many'
		| 'update-one'
		| 'upsert-many'
		| 'upsert-one'
	>()
	expectTypeOf<
		DatabaseMutationMaterialization<CreateOperation>
	>().toEqualTypeOf<DatabaseCreateMaterialization<ArticleLogicalRecord>>()
	expectTypeOf<
		DatabaseMutationLogicalRecord<CreateOperation>
	>().toEqualTypeOf<ArticleLogicalRecord>()
	expectTypeOf<
		DatabaseMutationMaterialization<UpdateOperation>
	>().toEqualTypeOf<DatabaseUpdateMaterialization<ArticleLogicalRecord>>()
	expectTypeOf<
		DatabaseMutationMaterialization<DeleteOperation>
	>().toEqualTypeOf<DatabaseDeleteMaterialization<ArticleLogicalRecord>>()
	expectTypeOf<
		DatabaseMutationMaterialization<UpdateManyOperation>
	>().toBeNever()
	expectTypeOf<
		DatabaseMutationMaterialization<DeleteManyOperation>
	>().toBeNever()
	expectTypeOf<
		DatabaseMutationMaterialization<UpsertOperation>
	>().toEqualTypeOf<
		| DatabaseCreateMaterialization<ArticleLogicalRecord>
		| DatabaseUpdateMaterialization<ArticleLogicalRecord>
	>()

	const transaction = null as unknown as DatabaseTransactionAdapter
	const preparedUpdate =
		null as unknown as PreparedDatabaseOperation<UpdateOperation>
	const preparedCreate =
		null as unknown as PreparedDatabaseOperation<CreateOperation>

	expectTypeOf(
		preparedUpdate.target,
	).toEqualTypeOf<ArticleLogicalRecord | null>()
	expectTypeOf(preparedCreate.target).toEqualTypeOf<undefined>()
	expectTypeOf<
		DatabaseOperationOutcome<CreateOperation>['materializations']
	>().toEqualTypeOf<
		readonly [DatabaseCreateMaterialization<ArticleLogicalRecord>]
	>()
	expectTypeOf<
		DatabaseOperationOutcome<UpdateManyOperation>['materializations']
	>().toEqualTypeOf<readonly []>()
	const read = {
		kind: 'find',
		query: new Query(articleSchema).ast,
	} satisfies FindOperationAst<typeof articleSchema>
	const count = {
		kind: 'count',
		query: new Query(articleSchema).ast,
	} satisfies CountOperationAst<typeof articleSchema>

	// @ts-expect-error -- Reads execute directly and cannot create mutation handles.
	void transaction.prepare({ constraints: [], operation: read })
	// @ts-expect-error -- Scalar reads cannot create mutation handles either.
	void transaction.prepare({ constraints: [], operation: count })
})
