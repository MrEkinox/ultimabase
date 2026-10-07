import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import type { SchemaDefinition } from '../../schema/index.js'
import type { QueryFilterNode } from './logical.js'
import type { WhereInput } from './where-contracts.js'
import { serializeWhereExpression } from './where-serialize.js'

export const createWhereTargetInput = <TSchema extends SchemaDefinition>(
	target: unknown,
	operator: string,
	operand: unknown,
): WhereInput<TSchema> => {
	if (typeof target === 'string') {
		return immutableRecord({
			[target]: immutableRecord({ [operator]: operand }),
		})
	}

	if (
		!isPlainRecord(target) ||
		target.kind !== 'field-path' ||
		typeof target.field !== 'string' ||
		!isUnknownArray(target.path)
	) {
		throw new TypeError('WhereBuilder target must be a field or field path')
	}

	return immutableRecord({
		[target.field]: immutableRecord({
			at: immutableArray([
				immutableRecord({ path: target.path, [operator]: operand }),
			]),
		}),
	})
}

/** Shares the canonical nested relation input across pointer and collection methods. */
export const createWhereRelationshipInput = <
	TSchema extends SchemaDefinition,
	TTarget extends SchemaDefinition,
>(
	fieldName: string,
	operator: string,
	nested: QueryFilterNode<TTarget>,
): WhereInput<TSchema> =>
	immutableRecord({
		[fieldName]: immutableRecord({
			[operator]: serializeWhereExpression(nested),
		}),
	})
