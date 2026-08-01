import type { PostgresIdentityKind } from '../introspection/contracts.js'

/** Describes one desired physical column without exposing its Drizzle builder. */
export interface DesiredPostgresColumn {
	readonly defaultExpression?: string
	readonly identity?: PostgresIdentityKind
	readonly name: string
	readonly nullable: boolean
	readonly primary: boolean
	readonly renamedFrom?: string
	readonly type: string
}

/** Describes one desired physical B-tree index. */
export interface DesiredPostgresIndex {
	readonly columns: readonly [string, ...string[]]
	readonly name: string
	readonly unique: boolean
}

/** Detaches desired synchronization metadata from Drizzle runtime objects. */
export interface DesiredPostgresTable {
	readonly columns: readonly DesiredPostgresColumn[]
	readonly indexes: readonly DesiredPostgresIndex[]
	readonly name: string
}

/** Lists the structural operations a direct policy can plan deterministically. */
export type PostgresSchemaChange =
	| {
			readonly kind: 'create-table'
			readonly table: DesiredPostgresTable
	  }
	| {
			readonly kind: 'add-column'
			readonly column: DesiredPostgresColumn
			readonly table: string
	  }
	| {
			readonly kind: 'rename-column'
			readonly from: string
			readonly table: string
			readonly to: string
	  }
	| {
			readonly kind: 'alter-column-type'
			readonly column: string
			readonly from: string
			readonly table: string
			readonly to: string
	  }
	| {
			readonly kind: 'set-column-nullability'
			readonly column: string
			readonly nullable: boolean
			readonly table: string
	  }
	| {
			readonly kind: 'set-column-default'
			readonly column: string
			readonly expression?: string
			readonly table: string
	  }
	| {
			readonly kind: 'set-column-identity'
			readonly column: string
			readonly identity?: PostgresIdentityKind
			readonly table: string
	  }
	| {
			readonly kind: 'drop-column'
			readonly column: string
			readonly table: string
	  }
	| {
			readonly kind: 'create-index'
			readonly index: DesiredPostgresIndex
			readonly table: string
	  }
	| {
			readonly kind: 'drop-index'
			readonly index: string
			readonly table: string
	  }
	| {
			readonly constraint: string
			readonly kind: 'drop-constraint'
			readonly table: string
	  }
	| {
			readonly columns: readonly [string, ...string[]]
			readonly currentConstraint?: string
			readonly kind: 'set-primary-key'
			readonly table: string
	  }
	| {
			readonly kind: 'unsupported-structure'
			readonly structure: string
			readonly table: string
	  }

/** Selects the built-in behavior when no migration plugin claims preparation. */
export type PostgresSchemaPolicy = 'fail' | 'ignore' | 'override'
