import type { InferObject, SchemaDefinition } from '../../schema/index.js'

import type { QueryFieldName } from '../ast/contracts.js'

/** Materializes one projection so editor QuickInfo hides the complete source object. */
type Simplify<TValue> = {
	[TKey in keyof TValue]: TValue[TKey]
} & {}

/** Infers one persisted object or its exact selected projection. */
export type InferQueryResult<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema> = never,
> = [TSelectedField] extends [never]
	? InferObject<TSchema>
	: Simplify<
			Pick<
				InferObject<TSchema>,
				Extract<TSelectedField, keyof InferObject<TSchema>>
			>
		>
