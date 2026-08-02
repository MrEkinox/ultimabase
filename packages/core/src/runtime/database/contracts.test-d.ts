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
import { Schema, intField, stringField } from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import {
	databaseAdapterServiceToken,
	type DatabaseAccessConstraintNode,
	type DatabaseAdapter,
	type DatabaseObjectRecord,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
} from './contracts.js'

const articleSchema = new Schema({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
		views: intField(),
	},
})

type ArticleRecord = DatabaseObjectRecord<typeof articleSchema>

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
	>().toEqualTypeOf<number>()
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
	>().toEqualTypeOf<number>()
})

test('preserves operation and access-constraint inference through execute', () => {
	interface TenantConstraint extends DatabaseAccessConstraintNode {
		readonly kind: 'fixture-tenant'
		readonly tenantId: string
	}

	const operation = {
		kind: 'find',
		query: new Query(articleSchema).equalTo('views', 10).ast,
	} satisfies FindOperationAst<typeof articleSchema>
	const request = {
		accessConstraints: [{ kind: 'fixture-tenant', tenantId: 'tenant-1' }],
		operation,
	} satisfies DatabaseOperationRequest<typeof operation, TenantConstraint>
	expectTypeOf(adapter.execute(request)).toEqualTypeOf<
		Promise<readonly ArticleRecord[]>
	>()
	expectTypeOf<
		(typeof request.accessConstraints)[number]['tenantId']
	>().toBeString()
	expectTypeOf(databaseAdapterServiceToken).toEqualTypeOf<
		ServiceToken<DatabaseAdapter>
	>()
})

test('distinguishes root and transaction adapter capabilities', () => {
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
})
