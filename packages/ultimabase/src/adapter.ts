// The adapter contract (D-73): what the kernel sends a storage adapter, fully
// prepared. Names are the models' own; `dbName` says what to store them as.
import type { JsonCondition } from './adapter-json.ts'
import type { Migrations } from './adapter-migrations.ts'
import type { Logger } from './app-options.ts'

export type {
	Migration,
	Migrations,
	Run,
	Statement,
	Stored,
} from './adapter-migrations.ts'
export {
	CheckFailed,
	MigrationFailed,
	OutOfRange,
	RelationViolation,
	UniqueViolation,
} from './adapter-errors.ts'

export type ScalarType =
	| 'string'
	| 'number'
	| 'decimal'
	| 'boolean'
	| 'dateTime'
	| 'date'
	| 'json'
	| 'enum'

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
			/**
			 * A `decimal`'s digits, `scale` of them after the point; its values
			 * are strings at that scale (D-145).
			 */
			readonly precision?: number
			readonly scale?: number
			readonly optional: boolean
			readonly unique: boolean
			/** A `string` in its model's document, which `_search` matches (D-148). */
			readonly search?: true
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
			/** Its reads see the rows a filter keeps; it takes no `set` (D-151). */
			readonly filtered?: true
			/**
			 * A view: read-only, on the link of the `many` it names, with that
			 * relation's `inverse` and `join` (D-151).
			 */
			readonly from?: string
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
export type Condition = JsonCondition & {
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
	/** A list holds each of these elements (D-149). */
	readonly hasEvery?: readonly unknown[]
	/** A list is empty, or not (D-149). */
	readonly isEmpty?: boolean
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
	/**
	 * Under the key `_search`: the row's searched fields match this text, in
	 * PostgreSQL's `websearch_to_tsquery` syntax (D-148).
	 */
	readonly search?: string
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
	/** Where `null` sorts: by default last ascending, first descending (D-149). */
	readonly nulls?: 'first' | 'last'
	/** The `one` relations followed first; an absent row sorts as `null` (D-134). */
	readonly through?: readonly Step[]
	/** `field` is a `many` relation: its rows this filter selects are counted (D-134). */
	readonly count?: Filter
	/** `field` is `_relevance`: how well the row matches this text (D-148). */
	readonly relevance?: string
}

export type Sort = Pick<Order, 'direction' | 'nulls'>

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
	/**
	 * Keeps, of the rows with the same keys, the first in `orderBy`'s order,
	 * before `skip` and `take` (D-147).
	 */
	readonly distinct?: readonly GroupKey[]
}

export type CountRead = { readonly model: string; readonly where?: Filter }

/** One aggregate: `count` without a field counts the rows (D-143). */
export type Aggregate = {
	readonly operation: 'count' | 'sum' | 'avg' | 'min' | 'max'
	/** A scalar field, neither a list nor `json`. */
	readonly field?: string
}

/** A group's key: a field, or the `id` of the row `through` reaches (D-146). */
export type GroupKey = {
	readonly field: string
	readonly through?: readonly Step[]
}

/**
 * Aggregates of the rows `where` selects, one value each, in order: a count
 * is a number, the others `null` without a value (D-143). With `by`, of each
 * group of rows with the same keys; an absent row gives `null` (D-146).
 */
export type AggregateRead = CountRead & {
	readonly aggregates: readonly Aggregate[]
	readonly by?: readonly GroupKey[]
	/** A position, `orderBy`'s `at` or a `having` key (D-149): keys, then aggregates. */
	readonly having?: Filter
	readonly orderBy?: readonly ({ readonly at: number } & Sort)[]
	readonly skip?: number
	readonly take?: number
}

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

/**
 * A list update computed on each row the write changes (D-149): `push`
 * appends, `pushUnique` appends each element the list lacks, once, and
 * `remove` drops every occurrence.
 */
export type ListUpdate = {
	readonly operation: 'push' | 'pushUnique' | 'remove'
	readonly elements: readonly unknown[]
}

/** In a change, a stored `one` key is the target's id or `null`. */
export type Change =
	| { readonly kind: 'insert'; readonly model: string; readonly row: Row }
	| {
			readonly kind: 'update'
			readonly model: string
			readonly where: Filter
			readonly set: { readonly [field: string]: unknown }
			readonly compute?: {
				readonly [field: string]: Arithmetic | ListUpdate
			}
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

/**
 * What a committed write changed (D-154): `ids` is absent when they were
 * more than `feedIds`, `fields` when they were every field or longer than
 * `feedFields`. A delete's links go with its rows, unlisted. How changes
 * group into entries and calls is the adapter's.
 */
export type Changed =
	| {
			readonly kind: 'insert' | 'update' | 'delete'
			readonly model: string
			readonly ids?: readonly string[]
			/** The fields an update set, `updatedAt` included. */
			readonly fields?: readonly string[]
	  }
	| {
			readonly kind: 'link' | 'unlink'
			readonly model: string
			/** A `many` relation facing a `many`. */
			readonly field: string
			/** The model's id, then the target's. */
			readonly pairs?: readonly (readonly [string, string])[]
	  }

/** The most ids or pairs a change lists (D-154). */
export const feedIds = 1000
/** The longest list of fields, as JSON, an update lists (D-154). */
export const feedFields = 1500

/** Where an adapter sends the changes each commit makes, on any server. */
export type Feed = {
	readonly changed: (changes: readonly Changed[]) => void
	/** Changes may have been lost, as when a listener reconnects. */
	readonly missed: () => void
}

export interface Transaction {
	find(read: Read): Promise<Row[]>
	count(read: CountRead): Promise<number>
	/**
	 * One list per group: its keys' values, then its aggregates'; without
	 * `by`, one list, even without rows (D-146).
	 */
	aggregate(read: AggregateRead): Promise<unknown[][]>
	write(write: Write): Promise<Row[]>
	commit(): Promise<void>
	rollback(): Promise<void>
}

/** A storage adapter: its own slot, not a plugin (D-02, D-73). */
export interface Adapter extends Omit<Transaction, 'commit' | 'rollback'> {
	/**
	 * Connects; the kernel then syncs or checks the tables (D-105). `logger`
	 * is the kernel's, for what the adapter reports (D-140). With `feed`, each
	 * commit's changes reach it, this server's and the others' (D-154).
	 */
	start(schema: Schema, logger: Logger, feed?: Feed): Promise<void>
	stop(): Promise<void>
	begin(): Promise<Transaction>
	/** None for a database that starts empty every time, as `memory()`. */
	readonly migrations?: Migrations
}
