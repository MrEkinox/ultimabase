/** Distinguishes supported identity generation without leaking catalog codes. */
export type PostgresIdentityKind = 'always' | 'byDefault'

export interface PostgresColumnSnapshot {
	readonly defaultExpression?: string
	readonly identity?: PostgresIdentityKind
	readonly name: string
	readonly nullable: boolean
	readonly type: string
}

export interface PostgresIndexSnapshot {
	readonly columns: readonly string[]
	readonly definition: string
	readonly method: string
	readonly name: string
	/** PostgreSQL's normalized `WHERE` of a partial index. */
	readonly predicate?: string
	readonly primary: boolean
	readonly unique: boolean
}

export interface PostgresConstraintSnapshot {
	readonly columns: readonly string[]
	readonly definition: string
	readonly kind: string
	readonly name: string
	readonly onDelete?: PostgresForeignKeyAction
	readonly targetColumns?: readonly string[]
	readonly targetTable?: string
}

/** Normalizes PostgreSQL catalog action codes into stable planner values. */
export type PostgresForeignKeyAction =
	'cascade' | 'noAction' | 'restrict' | 'setDefault' | 'setNull'

export interface PostgresTableSnapshot {
	readonly columns: readonly PostgresColumnSnapshot[]
	readonly constraints: readonly PostgresConstraintSnapshot[]
	readonly indexes: readonly PostgresIndexSnapshot[]
	readonly managed: boolean
	readonly name: string
}

export type PostgresUnsupportedStructureKind =
	| 'column-generated'
	| 'column-type'
	| 'constraint-kind'
	| 'index-expression'
	| 'index-included-columns'
	| 'index-method'
	| 'partitioned-table'
	| 'table-kind'

/** Records live features the direct policy cannot safely reproduce yet. */
export interface PostgresUnsupportedStructure {
	readonly kind: PostgresUnsupportedStructureKind
	readonly name: string
	readonly table: string
}

/** Provides stable comparable state for diffing without retaining driver rows. */
export interface PostgresDatabaseSnapshot {
	readonly namespace: string
	readonly tables: readonly PostgresTableSnapshot[]
	readonly unsupported: readonly PostgresUnsupportedStructure[]
}
