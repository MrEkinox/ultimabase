import { expectTypeOf, test } from 'vitest'

import {
	QueryBuilder,
	type CountOperationAst,
	type ExistsOperationAst,
	type FindManyOperationAst,
	type QueryExpressionNode,
} from '../../query/index.js'
import { Schema, stringField } from '../../schema/index.js'
import type { DatabaseOperationResult } from '../database/contracts.js'
import {
	collectOperationFieldOutputs,
	transformOperationFieldOutputs,
	type RuntimeFieldOutputValue,
} from './field-outputs.js'

const schema = Schema.define({
	className: 'FieldOutputTypes',
	fields: {
		title: stringField(),
		secret: stringField(),
	},
})
const findOperation: FindManyOperationAst<
	typeof schema,
	QueryExpressionNode,
	'title'
> = {
	kind: 'find-many',
	query: new QueryBuilder(schema).select({ title: true }).ast,
}
const countOperation = {
	kind: 'count',
	query: new QueryBuilder(schema).ast,
} satisfies CountOperationAst<typeof schema>
const existsOperation = {
	kind: 'exists',
	query: new QueryBuilder(schema).ast,
} satisfies ExistsOperationAst<typeof schema>
const findResult: DatabaseOperationResult<typeof findOperation> = [
	{ title: 'Selected' },
]

test('preserves exact operation result types across output traversal', () => {
	expectTypeOf(
		collectOperationFieldOutputs(findOperation, findResult),
	).toEqualTypeOf<readonly RuntimeFieldOutputValue[]>()
	expectTypeOf(
		transformOperationFieldOutputs(
			findOperation,
			findResult,
			({ kind, mode, value }) => {
				expectTypeOf(kind).toEqualTypeOf<RuntimeFieldOutputValue['kind']>()
				expectTypeOf(mode).toEqualTypeOf<'object'>()
				expectTypeOf(value).toBeUnknown()

				return value
			},
		),
	).toEqualTypeOf<Promise<DatabaseOperationResult<typeof findOperation>>>()
	expectTypeOf(
		transformOperationFieldOutputs(countOperation, 1, () => undefined),
	).toEqualTypeOf<Promise<number>>()
	expectTypeOf(
		transformOperationFieldOutputs(existsOperation, true, () => undefined),
	).toEqualTypeOf<Promise<boolean>>()

	void transformOperationFieldOutputs(
		countOperation,
		// @ts-expect-error -- Scalar terminal results cannot be replaced by records.
		{ count: 1 },
		() => undefined,
	)
})
