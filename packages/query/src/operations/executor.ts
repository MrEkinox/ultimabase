import type { SchemaDefinition } from '@ultimabase/schema'

import type { ExecutableOperationAst } from './contracts.js'
import type { InferOperationResult } from './results.js'

/** Defines the neutral execution shape required by BoundQuery terminals. */
export interface QueryOperationExecutor<
	TSchema extends SchemaDefinition = SchemaDefinition,
> {
	execute<const TOperation extends ExecutableOperationAst<TSchema>>(
		operation: TOperation,
	): Promise<InferOperationResult<TOperation>>
}
