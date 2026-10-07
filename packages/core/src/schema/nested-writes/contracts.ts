import type { GenericField } from '../fields/base/contract.js'
import type { SchemaDefinition } from '../schema/definition.js'
import type { SchemaContributionProvenance } from '../schema/provenance.js'

/** Selects the singular root mutation whose data produced one nested graph. */
export type NestedWriteRootCommand = 'create' | 'update'

/** Names every command that can appear below a relationship field. */
export type NestedWriteRelationshipCommand =
	'clear' | 'connect' | 'create' | 'disconnect' | 'set' | 'update'

/** Locates one value inside the caller-owned nested input. */
export type NestedWriteInputPath = readonly (number | string)[]

/** Configures the finite static traversal performed before Runtime effects. */
export interface NestedWriteLimits {
	readonly maxDepth: number
	readonly maxOperations: number
}

/** Retains exact declaration ownership beside each normalized graph node. */
export interface NestedWriteNodeProvenance {
	readonly contribution: SchemaContributionProvenance
	readonly declarationIndex: number
	readonly inputPath: NestedWriteInputPath
	readonly sourcePath: readonly string[]
}

/** Records one immutable singular object mutation and its relationship work. */
export interface NestedWriteObjectNode {
	readonly command: NestedWriteRootCommand
	readonly data: Readonly<Record<string, unknown>>
	readonly depth: number
	readonly kind: 'object'
	readonly operationIndex: number
	readonly provenance: NestedWriteNodeProvenance
	/** Exists only on the application-private graph prepared for Runtime execution. */
	readonly reservedId?: string
	readonly relationships: readonly NestedWriteRelationshipNode[]
	readonly schema: SchemaDefinition
}

interface NestedWriteRelationshipNodeBase {
	/** Counts only non-object identity or membership actions owned by this command. */
	readonly actionOperationIndexes: readonly number[]
	readonly command: NestedWriteRelationshipCommand
	readonly depth: number
	readonly field: GenericField
	readonly fieldName: string
	readonly input: unknown
	readonly provenance: NestedWriteNodeProvenance
	readonly source: SchemaDefinition
	readonly target: SchemaDefinition
}

/** Records one exclusive pointer command and its optional child object mutation. */
export interface NestedWritePointerNode extends NestedWriteRelationshipNodeBase {
	readonly child?: NestedWriteObjectNode
	readonly command: 'connect' | 'create' | 'disconnect' | 'update'
	readonly dependency: 'before-source'
	readonly id?: string
	readonly kind: 'pointer'
}

/** Records one ordered relation command and all of its target object mutations. */
export interface NestedWriteRelationNode extends NestedWriteRelationshipNodeBase {
	readonly children: readonly NestedWriteObjectNode[]
	readonly command:
		'clear' | 'connect' | 'create' | 'disconnect' | 'set' | 'update'
	readonly dependency: 'after-source'
	readonly ids: readonly string[]
	readonly kind: 'relation'
}

/** Names every normalized relationship node in one nested mutation graph. */
export type NestedWriteRelationshipNode =
	NestedWritePointerNode | NestedWriteRelationNode

/** Describes one complete bounded graph without carrying executable behavior. */
export interface NestedWriteGraph {
	readonly kind: 'nested-write-graph'
	readonly limits: NestedWriteLimits
	readonly operationCount: number
	readonly root: NestedWriteObjectNode
}
