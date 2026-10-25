// The adapter contract (D-73): what the kernel sends a storage adapter, fully
// prepared. Names are the models' own; `dbName` says what to store them as.

export type ScalarType =
	'string' | 'number' | 'boolean' | 'date' | 'json' | 'enum'

export type SchemaField =
	| {
			readonly kind: 'scalar'
			readonly name: string
			readonly type: ScalarType
			/** An `enum`'s values. */
			readonly values?: readonly string[]
			readonly optional: boolean
			readonly unique: boolean
			readonly dbName?: string
			/** Its default when it is a value, not a function (D-105). */
			readonly default?: unknown
	  }
	| {
			readonly kind: 'one'
			readonly name: string
			readonly target: string
			/** The target's field on the other side (D-37). */
			readonly inverse: string
			/** Whether this side stores the key, one per pair (D-37). */
			readonly stored: boolean
			/** One-to-one: the stored key is unique. */
			readonly unique: boolean
			readonly optional: boolean
			readonly onDelete: 'cascade' | 'restrict' | 'setNull'
			readonly dbName?: string
	  }
	| {
			readonly kind: 'many'
			readonly name: string
			readonly target: string
			readonly inverse: string
			/** Facing a `many`: a join holding the two keys only (D-64). */
			readonly join: boolean
	  }

export type SchemaModel = {
	readonly name: string
	readonly dbName?: string
	/** `id`, `createdAt` and `updatedAt` are implicit (D-22). */
	readonly fields: readonly SchemaField[]
	readonly indexes: readonly {
		readonly fields: readonly string[]
		readonly unique: boolean
	}[]
}

export type Schema = { readonly models: readonly SchemaModel[] }

/** A normalized condition on one field: no shorthand, no `undefined`. */
export type Condition = {
	readonly equals?: unknown
	readonly not?: unknown
	readonly in?: readonly unknown[]
	readonly notIn?: readonly unknown[]
	readonly lt?: unknown
	readonly lte?: unknown
	readonly gt?: unknown
	readonly gte?: unknown
	readonly contains?: string
	readonly startsWith?: string
	readonly endsWith?: string
	readonly is?: Filter | null
	readonly isNot?: Filter | null
	readonly some?: Filter
	readonly every?: Filter
	readonly none?: Filter
}

/** A normalized `where`: `AND`, `OR` and `NOT` are lists (D-73). */
export interface Filter {
	readonly AND?: readonly Filter[]
	readonly OR?: readonly Filter[]
	readonly NOT?: readonly Filter[]
	readonly [field: string]: Condition | readonly Filter[] | undefined
}

export type Order = {
	readonly field: string
	readonly direction: 'asc' | 'desc'
}

/** A relation to read with its rows; a `one` relation reads `where` only. */
export type Nested = {
	readonly where?: Filter
	/** Always ends with `id`, so the order is total. */
	readonly orderBy?: readonly Order[]
	/** A unique target the page starts at, as Prisma's `cursor`. */
	readonly cursor?: Filter
	readonly skip?: number
	/** Negative: the rows before the cursor, or the last ones. */
	readonly take?: number
	readonly include?: { readonly [field: string]: Nested }
}

export type Read = Nested & {
	readonly model: string
	/** Locks the root rows until the transaction ends (D-99). */
	readonly lock?: boolean
}

export type CountRead = { readonly model: string; readonly where?: Filter }

/**
 * A stored row: system and scalar fields, and each `one` relation as its key
 * `{ id } | null`, or the included row. An included `many` is a list of rows.
 */
export type Row = { readonly id: string; readonly [field: string]: unknown }

/** In a change, a stored `one` key is the target's id or `null`. */
export type Change =
	| { readonly kind: 'insert'; readonly model: string; readonly row: Row }
	| {
			readonly kind: 'update'
			readonly model: string
			readonly where: Filter
			readonly set: { readonly [field: string]: unknown }
	  }
	| { readonly kind: 'delete'; readonly model: string; readonly where: Filter }
	| {
			readonly kind: 'link' | 'unlink'
			readonly model: string
			/** A `many` relation facing a `many`. */
			readonly field: string
			readonly id: string
			readonly targets: readonly string[]
	  }

/** A count of rows a write needs before it changes anything (D-99). */
export type Check = {
	readonly model: string
	readonly where: Filter
	readonly count: number
}

/**
 * One whole write: its checks first, which write nothing when one fails,
 * then its changes, then `read`, in the same write. With `before`, the read
 * selects among the rows of its model that the write's delete removed, as
 * they were (D-102, D-104).
 */
export type Write = {
	readonly checks?: readonly Check[]
	readonly changes: readonly Change[]
	readonly read?: Read
	readonly before?: boolean
}

export interface Transaction {
	find(read: Read): Promise<Row[]>
	count(read: CountRead): Promise<number>
	write(write: Write): Promise<Row[]>
	commit(): Promise<void>
	rollback(): Promise<void>
}

/** One statement of a plan, as it runs and as a migration file shows it. */
export type Statement = {
	readonly sql: string
	/** The model it changes, and how, for the log: `Locker`, `added owner`. */
	readonly model: string
	readonly does: string
	/** What it deletes, when it loses data: `removing "Locker.label" deletes data`. */
	readonly loses?: string
	/**
	 * When the database refuses it, for a change rows can break:
	 * `limiting "Locker.kind" to wood, glass fails when a row holds another value`.
	 */
	readonly tries?: string
	/**
	 * A removal that may be a rename: the field or model that may be the same
	 * (`Locker.title`), the name it keeps its data under with `dbName`
	 * (`label`), and the SQL that renames instead.
	 */
	readonly rename?: {
		readonly to: string
		readonly dbName: string
		readonly sql: string
	}
}

/** A migration file: its file name, its SQL and its SHA-256. */
export type Migration = {
	readonly name: string
	readonly sql: string
	readonly checksum: string
	/** The models' hash its header names, which a production start reads. */
	readonly schema?: string
	/** False when its second line is `-- ultimabase no transaction`. */
	readonly transaction: boolean
}

/** The snapshot a database's tables match, and who wrote it (D-105). */
export type Stored = {
	/** None when a deploy stopped before it stored one. */
	readonly snapshot: unknown
	readonly by: 'sync' | 'deploy'
	/** In name order. */
	readonly applied: readonly {
		readonly name: string
		readonly checksum: string
		readonly schema?: string
	}[]
}

/**
 * Development sync's statements, or the migration files to deploy, each in
 * its transaction; then `to` is stored.
 */
export type Run =
	| {
			readonly kind: 'sync'
			/** The snapshot the statements start from, checked under the lock. */
			readonly from: unknown
			readonly statements: readonly Statement[]
			readonly to: unknown
	  }
	| {
			readonly kind: 'deploy'
			readonly files: readonly Migration[]
			readonly to: unknown
	  }

/**
 * How a database follows the models (D-105). A snapshot is JSON in the
 * adapter's own format, which it validates when it reads one back.
 */
export interface Migrations {
	/** What this database makes of the models. */
	snapshot(schema: Schema): unknown
	/**
	 * The statements from a snapshot, or an empty database, to the models'
	 * snapshot; a required field added takes its `default` in the rows.
	 */
	plan(from: unknown, schema: Schema): readonly Statement[]
	/** The database's snapshot, if it has one; the adapter is started. */
	stored(): Promise<Stored | undefined>
	/**
	 * Applies `run` under a lock that one database holds at a time; a
	 * statement or file the database refuses throws `MigrationFailed`.
	 */
	apply(run: Run): Promise<void>
	/** Drops every table, for `ultimabase reset`; returns the models' tables. */
	reset(): Promise<readonly string[]>
	/** The database's host when it is not on this machine: `reset` then needs `--force`. */
	readonly remote?: string
}

/** A host only this machine reaches (D-66, D-105, D-115). */
export function isLocalHost(hostname: string): boolean {
	return (
		hostname === 'localhost' ||
		hostname.endsWith('.localhost') ||
		hostname === '127.0.0.1' ||
		hostname === '[::1]'
	)
}

/** A storage adapter: its own slot, not a plugin (D-02, D-73). */
export interface Adapter extends Omit<Transaction, 'commit' | 'rollback'> {
	/** Connects; the kernel then syncs or checks the tables (D-105). */
	start(schema: Schema): Promise<void>
	stop(): Promise<void>
	begin(): Promise<Transaction>
	/** None for a database that starts empty every time, as `memory()`. */
	readonly migrations?: Migrations
}

/** A unique index refused a write; the kernel reports `UNIQUE_VIOLATION`. */
export class UniqueViolation extends Error {
	readonly model: string
	readonly fields: readonly string[]

	constructor(model: string, fields: readonly string[]) {
		super(`Unique constraint failed on ${model} (${fields.join(', ')}).`)
		this.name = 'UniqueViolation'
		this.model = model
		this.fields = fields
	}
}

/**
 * A foreign key refused a write that raced another (D-99): `model.field`
 * links a `target` deleted meanwhile, or, `restricted`, the write deleted a
 * `target` that `model.field` still links.
 */
export class RelationViolation extends Error {
	readonly model: string
	readonly field: string
	readonly target: string
	readonly restricted: boolean

	constructor(
		model: string,
		field: string,
		target: string,
		restricted: boolean,
	) {
		super(
			restricted
				? `${model}.${field} still links a deleted ${target}.`
				: `${model}.${field} links a missing ${target}.`,
		)
		this.name = 'RelationViolation'
		this.model = model
		this.field = field
		this.target = target
		this.restricted = restricted
	}
}

/** A check of a write found another count: nothing was written (D-99). */
export class CheckFailed extends Error {
	readonly index: number

	constructor(index: number) {
		super(`Check ${String(index)} of the write failed.`)
		this.name = 'CheckFailed'
		this.index = index
	}
}

/** The database refused a sync's statement or a deploy's file (D-105). */
export class MigrationFailed extends Error {
	/** The statement's SQL, or the file's name. */
	readonly at: string
	/** What the database said. */
	readonly reason: string

	constructor(at: string, reason: string) {
		super(`The database refused ${at}: ${reason}`)
		this.name = 'MigrationFailed'
		this.at = at
		this.reason = reason
	}
}
