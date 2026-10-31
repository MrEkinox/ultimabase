// The errors an adapter throws, which the kernel reports to the client (D-73).

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
 * The database aborted a transaction for a conflict with another, a
 * serialization failure or a deadlock: a serializable transaction runs again
 * (D-179).
 */
export class Conflict extends Error {
	constructor(options?: { readonly cause?: unknown }) {
		super('The transaction conflicted with another.', options)
		this.name = 'Conflict'
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

/**
 * A computed number fell outside its field's range, or was not finite on a
 * float: nothing was written (D-132).
 */
export class OutOfRange extends Error {
	readonly model: string
	readonly field: string

	constructor(model: string, field: string) {
		super(`The result for ${model}.${field} is out of range.`)
		this.name = 'OutOfRange'
		this.model = model
		this.field = field
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
	/** Whether it waited past its limit for a table another session held. */
	readonly locked: boolean

	constructor(at: string, reason: string, locked = false) {
		super(`The database refused ${at}: ${reason}`)
		this.name = 'MigrationFailed'
		this.at = at
		this.reason = reason
		this.locked = locked
	}
}
