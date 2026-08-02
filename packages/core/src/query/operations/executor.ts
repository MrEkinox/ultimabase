import type { SchemaDefinition } from '../../schema/index.js'

import type { ExecutableOperationAst } from './contracts.js'
import type { InferOperationResult } from './results.js'

/** Identifies an execution owner without narrowing it to one schema union. */
export interface QueryExecutorBinding {
	execute(operation: never): Promise<unknown>
}

/** Defines the neutral execution shape required by BoundQuery terminals. */
export interface QueryOperationExecutor<
	TSchema extends SchemaDefinition = SchemaDefinition,
> extends QueryExecutorBinding {
	execute<const TOperation extends ExecutableOperationAst<TSchema>>(
		operation: TOperation,
	): Promise<InferOperationResult<TOperation>>
}
