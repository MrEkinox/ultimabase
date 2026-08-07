import type { SchemaDefinition } from '../../schema/index.js'

import type { ExecutableOperationAst } from './contracts.js'
import type { InferOperationResult } from './results.js'

/** Defines the neutral execution shape required by contextual operations. */
export interface QueryOperationExecutor<
	TSchema extends SchemaDefinition = SchemaDefinition,
> {
	execute<const TOperation extends ExecutableOperationAst<TSchema>>(
		operation: TOperation,
	): Promise<InferOperationResult<TOperation>>
}
