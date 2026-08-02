import { createServiceToken } from '../../foundation.js'
import type { ServiceToken } from '../../foundation.js'
import type {
	InferOperationResult,
	InferQueryResult,
	OperationAstNode,
	OperationKind,
	QueryFieldName,
	QuerySchemaNode,
} from '../../query/index.js'
import type { InferObject, SchemaDefinition } from '../../schema/index.js'

/**
 * Retains the closed operation discriminants while allowing each request to
 * preserve its exact schema-specific AST through the generic adapter method.
 */
export interface DatabaseOperationAst extends OperationAstNode {
	readonly kind: OperationKind
}

/** Lists every write terminal that executes through an automatic transaction. */
export type DatabaseMutationOperationKind = Exclude<
	OperationKind,
	'count' | 'exists' | 'find' | 'first' | 'get'
>

/** Narrows the portable adapter boundary to normalized mutation terminals. */
export interface DatabaseMutationOperationAst extends DatabaseOperationAst {
	readonly kind: DatabaseMutationOperationKind
}

/** Lets access plugins contribute portable row constraints without SQL nodes. */
export interface DatabaseAccessConstraintNode {
	readonly kind: string
}

/**
 * Keeps the normalized operation and mandatory access constraints together so
 * adapters cannot receive an operation without an explicit access decision.
 */
export interface DatabaseOperationRequest<
	TOperation extends DatabaseOperationAst = DatabaseOperationAst,
	TConstraint extends DatabaseAccessConstraintNode =
		DatabaseAccessConstraintNode,
> {
	readonly accessConstraints: readonly TConstraint[]
	readonly operation: TOperation
}

/** Represents the exact persisted projection returned after query selection. */
export type DatabaseObjectRecord<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema> = never,
> = InferQueryResult<TSchema, TSelectedField>

/**
 * Reuses Query's terminal result contract so adapters and public terminals
 * cannot drift on selection, nullability, or singular versus bulk semantics.
 */
export type DatabaseOperationResult<TOperation extends OperationAstNode> =
	InferOperationResult<TOperation>

/** Carries one complete adapter-decoded object without exposing physical rows. */
export type DatabaseLogicalRecord = Readonly<Record<string, unknown>>

type DatabaseMutationSchema<TOperation extends DatabaseMutationOperationAst> =
	TOperation extends {
		readonly query: { readonly schema: QuerySchemaNode<infer TSchema> }
	}
		? TSchema
		: TOperation extends { readonly schema: QuerySchemaNode<infer TSchema> }
			? TSchema
			: never

/** Recovers the complete logical object carried by one exact mutation AST. */
export type DatabaseMutationLogicalRecord<
	TOperation extends DatabaseMutationOperationAst,
> = [DatabaseMutationSchema<TOperation>] extends [never]
	? DatabaseLogicalRecord
	: Readonly<InferObject<DatabaseMutationSchema<TOperation>>>

/** Describes one materialized create independently from public selection. */
export interface DatabaseCreateMaterialization<
	TRecord extends DatabaseLogicalRecord = DatabaseLogicalRecord,
> {
	readonly kind: 'create'
	readonly current: TRecord
}

/** Retains both sides of one materialized update for semantic change hooks. */
export interface DatabaseUpdateMaterialization<
	TRecord extends DatabaseLogicalRecord = DatabaseLogicalRecord,
> {
	readonly kind: 'update'
	readonly previous: TRecord
	readonly current: TRecord
}

/** Retains the complete logical object removed by one materialized delete. */
export interface DatabaseDeleteMaterialization<
	TRecord extends DatabaseLogicalRecord = DatabaseLogicalRecord,
> {
	readonly kind: 'delete'
	readonly previous: TRecord
}

/** Enumerates the portable logical changes observable by native field hooks. */
export type DatabaseMutationMaterialization<
	TOperation extends DatabaseMutationOperationAst =
		DatabaseMutationOperationAst,
> = TOperation['kind'] extends infer TKind
	? TKind extends 'create-many' | 'create-one'
		? DatabaseCreateMaterialization<DatabaseMutationLogicalRecord<TOperation>>
		: TKind extends 'update-one'
			? DatabaseUpdateMaterialization<DatabaseMutationLogicalRecord<TOperation>>
			: TKind extends 'delete-one'
				? DatabaseDeleteMaterialization<
						DatabaseMutationLogicalRecord<TOperation>
					>
				: TKind extends 'upsert-many' | 'upsert-one'
					? | DatabaseCreateMaterialization<
								DatabaseMutationLogicalRecord<TOperation>
						  >
						| DatabaseUpdateMaterialization<
								DatabaseMutationLogicalRecord<TOperation>
						  >
					: never
	: never

interface DatabaseMaterializedOutcome<
	TOperation extends DatabaseMutationOperationAst,
	TResult,
	TMaterializations extends
		readonly DatabaseMutationMaterialization<TOperation>[],
> {
	readonly result: TResult
	readonly materializations: TMaterializations
}

type DatabaseSingularMutationOutcome<
	TOperation extends DatabaseMutationOperationAst,
> =
	| DatabaseMaterializedOutcome<TOperation, null, readonly []>
	| DatabaseMaterializedOutcome<
			TOperation,
			NonNullable<DatabaseOperationResult<TOperation>>,
			readonly [DatabaseMutationMaterialization<TOperation>]
	  >

type DatabaseOperationOutcomeFor<
	TOperation extends DatabaseMutationOperationAst,
> = TOperation['kind'] extends 'create-one' | 'upsert-one'
	? DatabaseMaterializedOutcome<
			TOperation,
			DatabaseOperationResult<TOperation>,
			readonly [DatabaseMutationMaterialization<TOperation>]
		>
	: TOperation['kind'] extends 'delete-one' | 'update-one'
		? DatabaseSingularMutationOutcome<TOperation>
		: TOperation['kind'] extends 'delete-many' | 'update-many'
			? DatabaseMaterializedOutcome<
					TOperation,
					DatabaseOperationResult<TOperation>,
					readonly []
				>
			: DatabaseMaterializedOutcome<
					TOperation,
					DatabaseOperationResult<TOperation>,
					readonly DatabaseMutationMaterialization<TOperation>[]
				>

/** Separates the selected public result from cardinality-safe private snapshots. */
export type DatabaseOperationOutcome<
	TOperation extends DatabaseMutationOperationAst,
> = TOperation extends DatabaseMutationOperationAst
	? DatabaseOperationOutcomeFor<TOperation>
	: never

/**
 * Owns one transaction-bound operation whose physical target is already stable.
 *
 * Implementations must reject every `execute()` call after the first attempt,
 * including retries after the original execution rejects.
 */
interface PreparedDatabaseOperationHandle<
	TOperation extends DatabaseMutationOperationAst,
> {
	/** Executes the retained target exactly once and returns its private outcome. */
	execute(): Promise<DatabaseOperationOutcome<TOperation>>
}

/** Adds the stable preimage only when a singular update or delete can have one. */
export type PreparedDatabaseOperation<
	TOperation extends DatabaseMutationOperationAst,
> = TOperation extends DatabaseMutationOperationAst
	? PreparedDatabaseOperationHandle<TOperation> &
			(TOperation['kind'] extends 'delete-one' | 'update-one'
				? {
						/** `null` means that the singular mutation matched no persisted object. */
						readonly target: DatabaseMutationLogicalRecord<TOperation> | null
					}
				: { readonly target?: never })
	: never

/** Executes one normalized operation while preserving its exact result type. */
export interface DatabaseOperationExecutor {
	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>>
}

/** Owns regular operations and starts isolated adapter transactions. */
export interface DatabaseAdapter extends DatabaseOperationExecutor {
	readonly kind: 'database-adapter'
	beginTransaction(): Promise<DatabaseTransactionAdapter>
}

/**
 * Executes operations on one active transaction while Runtime explicitly
 * rejects nesting until adapters gain a portable savepoint contract.
 */
export interface DatabaseTransactionAdapter extends DatabaseOperationExecutor {
	readonly kind: 'database-transaction-adapter'
	/** Prepares one stable mutation target before affected-field hooks execute. */
	prepare<const TOperation extends DatabaseMutationOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<PreparedDatabaseOperation<TOperation>>
	commit(): Promise<void>
	rollback(): Promise<void>
}

/** Identifies the single database adapter service owned by each application. */
export const databaseAdapterServiceToken: ServiceToken<DatabaseAdapter> =
	createServiceToken<DatabaseAdapter>('ultimabase.database-adapter')
