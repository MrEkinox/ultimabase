// The adapter contract (D-73): what the kernel sends a storage adapter, fully
// prepared. Names are the models' own; `dbName` says what to store them as.
import type { Logger } from './app-options.ts'

export {
	CheckFailed,
	MigrationFailed,
	OutOfRange,
	RelationViolation,
	UniqueViolation,
} from './adapter-errors.ts'

export type ScalarType =
	'string' | 'number' | 'boolean' | 'date' | 'json' | 'enum'

export type SchemaField =
	| {
			readonly kind: 'scalar'
			readonly name: string
			readonly type: ScalarType
			/** An `enum`'s values. */
			readonly values?: readonly string[]
			/**
			 * A list of `type`, a string, a number or an enum value: never
			 * `null`, `[]` when empty (D-120, D-127).
			 */
			readonly list: boolean
			/** A `number` of whole numbers from -2^31 to 2^31 - 1 (D-132). */
			readonly integer?: true
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
		/** Serves `contains` and `mode: 'insensitive'` (D-141). */
		readonly contains: boolean
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
	/** The string operators ignore case (D-140). */
	readonly mode?: 'insensitive'
	/** A list holds this element (D-120, D-127). */
	readonly has?: unknown
	/** A list holds one of these elements (D-120, D-127). */
	readonly hasSome?: readonly unknown[]
	readonly is?: Filter | null
	readonly isNot?: Filter | null
	readonly some?: Filter
	readonly every?: Filter
	readonly none?: Filter
	/**
	 * A stored `one` key names a row that the delete at this index of the
	 * write's changes removed, a change before this one (D-102).
	 */
	readonly removedBy?: number
}

/** A normalized `where`: `AND`, `OR` and `NOT` are lists (D-73). */
export interface Filter {
	readonly AND?: readonly Filter[]
	readonly OR?: readonly Filter[]
	readonly NOT?: readonly Filter[]
	readonly [field: string]: Condition | readonly Filter[] | undefined
}

/** A `one` relation a sort key goes through, to the rows `where` selects. */
export type Step = { readonly relation: string; readonly where?: Filter }

export type Order = {
	/** A field of the row, or of the row `through` reaches. */
	readonly field: string
	readonly direction: 'asc' | 'desc'
	/** The `one` relations followed first; an absent row sorts as `null` (D-134). */
	readonly through?: readonly Step[]
	/** `field` is a `many` relation: its rows this filter selects are counted (D-134). */
	readonly count?: Filter
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
	/**
	 * The system and scalar fields the rows return, `id` always; absent, every
	 * field and each `one` key (D-136).
	 */
	readonly fields?: readonly string[]
	readonly include?: { readonly [field: string]: Nested }
	/** `many` relations to count in the row's `_count`, by filter (D-134). */
	readonly count?: { readonly [field: string]: Filter }
}

export type Read = Nested & {
	readonly model: string
	/** Locks the root rows, in `id` order, until the transaction ends (D-99, D-133). */
	readonly lock?: boolean
}

export type CountRead = { readonly model: string; readonly where?: Filter }

/**
 * A stored row: system and scalar fields, and each `one` relation as its key
 * `{ id } | null`, or the included row. An included `many` is a list of rows.
 */
export type Row = { readonly id: string; readonly [field: string]: unknown }

/**
 * A number update computed on each row the write changes, `null` counting
 * as 0; an integer's division truncates toward zero (D-132).
 */
export type Arithmetic = {
	readonly operation: 'increment' | 'decrement' | 'multiply' | 'divide'
	readonly by: number
}

/** In a change, a stored `one` key is the target's id or `null`. */
export type Change =
	| { readonly kind: 'insert'; readonly model: string; readonly row: Row }
	| {
			readonly kind: 'update'
			readonly model: string
			readonly where: Filter
			readonly set: { readonly [field: string]: unknown }
			readonly compute?: { readonly [field: string]: Arithmetic }
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
	/** Locks the rows it counts until the transaction ends, as `Read.lock` (D-99). */
	readonly lock?: boolean
}

/**
 * One whole write: its checks first, which write nothing when one fails,
 * then its changes, then `read`, in the same write. With `before`, the read
 * selects among the rows of its model that the write's delete removed, as
 * they were (D-102, D-104); when the write deletes none of them, among the
 * rows its first update of that model changed, as it left them (D-133).
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
	/**
	 * Drops every table, for `ultimabase reset`; returns the models' tables.
	 * A table another session holds throws a locked `MigrationFailed`.
	 */
	reset(): Promise<readonly string[]>
	/** The database's host when it is not on this machine: `reset` then needs `--force`. */
	readonly remote?: string
}

/** A storage adapter: its own slot, not a plugin (D-02, D-73). */
export interface Adapter extends Omit<Transaction, 'commit' | 'rollback'> {
	/**
	 * Connects; the kernel then syncs or checks the tables (D-105). `logger`
	 * is the kernel's, for what the adapter reports (D-140).
	 */
	start(schema: Schema, logger: Logger): Promise<void>
	stop(): Promise<void>
	begin(): Promise<Transaction>
	/** None for a database that starts empty every time, as `memory()`. */
	readonly migrations?: Migrations
}
