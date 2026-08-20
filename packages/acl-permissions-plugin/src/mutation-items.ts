import type { SchemaDefinition } from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

interface ACLMutationItemPair {
	readonly originalItem: Readonly<Record<string, unknown>> | null
	readonly item: Readonly<Record<string, unknown>> | null
}

/** Accepts Runtime snapshots and exact generated instances at the behavior boundary. */
const isACLMutationItem = (
	schema: SchemaDefinition,
	value: unknown,
): value is Readonly<Record<string, unknown>> =>
	isPlainRecord(value) ||
	(typeof schema === 'function' && value instanceof schema)

/** Normalizes mutation materializations and legacy-shaped Runtime item pairs. */
export const readACLMutationItems = (
	schema: SchemaDefinition,
	input: unknown,
): readonly ACLMutationItemPair[] => {
	if (!isPlainRecord(input)) {
		throw new TypeError('ACL mutation input must be an object')
	}

	if (isUnknownArray(input.materializations)) {
		return immutableArray(
			input.materializations.map((materialization) => {
				if (!isPlainRecord(materialization)) {
					throw new TypeError('ACL mutation materialization is invalid')
				}
				if (
					materialization.kind === 'create' &&
					isACLMutationItem(schema, materialization.current)
				) {
					return immutableRecord({
						item: materialization.current,
						originalItem: null,
					})
				}
				if (
					materialization.kind === 'update' &&
					isACLMutationItem(schema, materialization.previous) &&
					isACLMutationItem(schema, materialization.current)
				) {
					return immutableRecord({
						item: materialization.current,
						originalItem: materialization.previous,
					})
				}
				if (
					materialization.kind === 'delete' &&
					isACLMutationItem(schema, materialization.previous)
				) {
					return immutableRecord({
						item: null,
						originalItem: materialization.previous,
					})
				}
				throw new TypeError('ACL mutation materialization is invalid')
			}),
		)
	}

	if (isUnknownArray(input.items)) {
		return immutableArray(
			input.items.map((candidate) => {
				if (
					!isPlainRecord(candidate) ||
					(candidate.originalItem !== null &&
						!isACLMutationItem(schema, candidate.originalItem)) ||
					(candidate.item !== null &&
						!isACLMutationItem(schema, candidate.item))
				) {
					throw new TypeError('ACL mutation item pair is invalid')
				}
				return immutableRecord({
					item: candidate.item,
					originalItem: candidate.originalItem,
				})
			}),
		)
	}

	if (
		!Object.hasOwn(input, 'originalItem') ||
		!Object.hasOwn(input, 'item') ||
		(input.originalItem !== null &&
			!isACLMutationItem(schema, input.originalItem)) ||
		(input.item !== null && !isACLMutationItem(schema, input.item))
	) {
		throw new TypeError('ACL singular mutation item pair is invalid')
	}

	return immutableArray([
		immutableRecord({ item: input.item, originalItem: input.originalItem }),
	])
}
