import { createServiceToken } from '@ultimabase/core'
import type { ServiceToken } from '@ultimabase/core'
import type { OperationAstNode, OperationKind } from '@ultimabase/query'
import type { InferObject, SchemaDefinition } from '@ultimabase/schema'

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

type DatabaseOperationSchema<TOperation extends OperationAstNode> =
	TOperation extends {
		readonly query: {
			readonly schema: {
				readonly definition: infer TSchema extends SchemaDefinition
			}
		}
	}
		? TSchema
		: TOperation extends {
					readonly schema: {
						readonly definition: infer TSchema extends SchemaDefinition
					}
			  }
			? TSchema
			: never

/** Represents the fields returned by one adapter after query selection. */
export type DatabaseObjectRecord<TSchema extends SchemaDefinition> = Readonly<
	Partial<InferObject<TSchema>>
>

/**
 * Correlates every operation kind with its adapter result semantics. Runtime
 * later validates selected object shapes before exposing developer results.
 */
export type DatabaseOperationResult<TOperation extends OperationAstNode> =
	TOperation extends { readonly kind: 'find' }
		? readonly DatabaseObjectRecord<DatabaseOperationSchema<TOperation>>[]
		: TOperation extends {
					readonly kind: 'first' | 'get' | 'update-one' | 'delete-one'
			  }
			? DatabaseObjectRecord<DatabaseOperationSchema<TOperation>> | null
			: TOperation extends { readonly kind: 'create-one' | 'upsert-one' }
				? DatabaseObjectRecord<DatabaseOperationSchema<TOperation>>
				: TOperation extends { readonly kind: 'create-many' | 'upsert-many' }
					? readonly DatabaseObjectRecord<DatabaseOperationSchema<TOperation>>[]
					: TOperation extends {
								readonly kind: 'count' | 'update-many' | 'delete-many'
						  }
						? number
						: TOperation extends { readonly kind: 'exists' }
							? boolean
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
