import type { SchemaDefinition } from '../../schema/index.js'
import { immutableRecord } from '@ultimabase/shared'

import type {
	CountOperationAst,
	ExistsOperationAst,
	FindManyOperationAst,
	FindOneOperationAst,
	GetOperationAst,
} from './contracts.js'
import {
	queryFromCountInput,
	queryFromExistsInput,
	queryFromFindManyInput,
	queryFromFindOneInput,
	queryFromGetInput,
} from '../query/input.js'

/** Names every native logical read accepted by transport-neutral normalization. */
export type ReadOperationKind =
	'count' | 'exists' | 'find-many' | 'find-one' | 'get'

/** Represents one normalized read without execution or transport state. */
export type ReadOperationAst<
	TSchema extends SchemaDefinition = SchemaDefinition,
> =
	| CountOperationAst<TSchema>
	| ExistsOperationAst<TSchema>
	| FindManyOperationAst<TSchema>
	| FindOneOperationAst<TSchema>
	| GetOperationAst<TSchema>

/** Resolves the exact native AST selected by one read discriminant. */
export type ReadOperationAstForKind<
	TSchema extends SchemaDefinition,
	TKind extends ReadOperationKind,
> = TKind extends 'count'
	? CountOperationAst<TSchema>
	: TKind extends 'exists'
		? ExistsOperationAst<TSchema>
		: TKind extends 'find-many'
			? FindManyOperationAst<TSchema>
			: TKind extends 'find-one'
				? FindOneOperationAst<TSchema>
				: GetOperationAst<TSchema>

/** Normalizes an untrusted native read input into the existing immutable operation AST. */
export const normalizeReadOperation = <
	const TSchema extends SchemaDefinition,
	const TKind extends ReadOperationKind,
>(
	schema: TSchema,
	kind: TKind,
	input: unknown,
): ReadOperationAstForKind<TSchema, TKind> => {
	let operation: ReadOperationAst<TSchema>
	switch (kind) {
		case 'find-many':
			operation = immutableRecord({
				kind: 'find-many',
				query: queryFromFindManyInput(schema, input as never).ast,
			})
			break
		case 'find-one':
			operation = immutableRecord({
				kind: 'find-one',
				query: queryFromFindOneInput(schema, input as never).ast,
			})
			break
		case 'get': {
			const normalized = queryFromGetInput(schema, input as never)
			operation = immutableRecord({
				id: normalized.id,
				kind: 'get',
				query: normalized.query.ast,
			})
			break
		}
		case 'count':
			operation = immutableRecord({
				kind: 'count',
				query: queryFromCountInput(schema, input as never).ast,
			})
			break
		case 'exists':
			operation = immutableRecord({
				kind: 'exists',
				query: queryFromExistsInput(schema, input as never).ast,
			})
			break
	}
	return operation as ReadOperationAstForKind<TSchema, TKind>
}
