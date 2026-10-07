import type { SchemaDefinition } from '../../schema/index.js'
import type { QueryFilterNode } from './logical.js'
import type { WhereBuilder } from './where-builder.js'

export interface WhereBuilderState<TSchema extends SchemaDefinition> {
	readonly expression: QueryFilterNode<TSchema> | undefined
	readonly schema: TSchema
}

const whereBuilderStates = new WeakMap<object, unknown>()

/** Keeps immutable builder state outside the frozen public instance. */
export const storeWhereBuilderState = <TSchema extends SchemaDefinition>(
	builder: WhereBuilder<TSchema>,
	state: WhereBuilderState<TSchema>,
): void => {
	whereBuilderStates.set(builder, state)
}

export const readWhereBuilderState = <TSchema extends SchemaDefinition>(
	builder: WhereBuilder<TSchema>,
): WhereBuilderState<TSchema> => {
	const state = whereBuilderStates.get(builder)

	if (state === undefined) {
		throw new TypeError('WhereBuilder has no internal state')
	}

	return state as unknown as WhereBuilderState<TSchema>
}
