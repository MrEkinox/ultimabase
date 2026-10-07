import type { PreparedSchemaCompilation } from '../../schema/schema/definition.js'
import type {
	OwnedSchemaPatch,
	SchemaDeclarationBatch,
} from '../schema-declaration-contracts.js'
import type { SchemaSelection } from '../schema-patch-contracts.js'

/** Prepared private declarations retain domain identities, never transport artifacts. */
export interface PreparedSchemaBatch {
	readonly additions: readonly PreparedSchemaCompilation[]
	readonly owner: SchemaDeclarationBatch['owner']
	readonly patches: readonly OwnedSchemaPatch[]
	readonly selections: readonly SchemaSelection[]
}

/** Both command binding and integrity validation consume these inert selection facts. */
export interface CompiledSchemaSelection {
	readonly classNames: readonly string[]
	readonly selectionId: string
}

export interface SchemaCompilationResult {
	readonly candidates: readonly PreparedSchemaCompilation[]
	readonly selections: readonly CompiledSchemaSelection[]
}
