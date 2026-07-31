import type { InferObject, SchemaDefinition } from '@ultimabase/schema'

import type { QueryFieldName } from '../ast/contracts.js'

/** Infers one persisted object or its exact selected projection. */
export type InferQueryResult<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema> = never,
> = [TSelectedField] extends [never]
	? InferObject<TSchema>
	: Pick<
			InferObject<TSchema>,
			Extract<TSelectedField, keyof InferObject<TSchema>>
		>
