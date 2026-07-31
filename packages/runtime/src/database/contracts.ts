import { createServiceToken } from '@ultimabase/core'
import type { ServiceToken } from '@ultimabase/core'
import type {
	InferOperationResult,
	InferQueryResult,
	OperationAstNode,
	OperationKind,
	QueryFieldName,
} from '@ultimabase/query'
import type { SchemaDefinition } from '@ultimabase/schema'

/**
 * Retains the closed operation discriminants while allowing each request to
 * preserve its exact schema-specific AST through the generic adapter method.
 */
export interface DatabaseOperationAst extends OperationAstNode {
	readonly kind: OperationKind
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
 * Executes operations on one active transaction and deliberately cannot begin
 * nested transactions without a future explicit Runtime policy.
 */
export interface DatabaseTransactionAdapter extends DatabaseOperationExecutor {
	readonly kind: 'database-transaction-adapter'
	commit(): Promise<void>
	rollback(): Promise<void>
}

/** Identifies the single database adapter service owned by each application. */
export const databaseAdapterServiceToken: ServiceToken<DatabaseAdapter> =
	createServiceToken<DatabaseAdapter>('ultimabase.database-adapter')
