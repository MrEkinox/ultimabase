import { createServiceToken } from '../../foundation.js'
import type { ServiceToken } from '../../foundation.js'
import type {
	InferOperationSourceRecordResult,
	InferQueryRecord,
	OperationAstNode,
	OperationKind,
	QueryFieldName,
	QueryFilterExpression,
	QueryRelationFilterNode,
	QuerySchemaNode,
} from '../../query/index.js'
import type { InferObject, SchemaDefinition } from '../../schema/index.js'
import { immutableRecord } from '@ultimabase/shared'

/** Selects the portable pointer protocol currently understood by Core Runtime. */
export const databasePointerCapabilityVersion = 1 as const

/** Selects the eager relationship-inclusion protocol understood by Runtime. */
export const databaseInclusionCapabilityVersion = 1 as const

/** Selects the portable relation protocol currently understood by Core Runtime. */
export const databaseRelationCapabilityVersion = 1 as const

/** Selects the correlated relation-predicate protocol understood by adapters. */
export const databaseRelationPredicateCapabilityVersion = 3 as const

/** Advertises logical pointer storage, predicates, and inclusion source values. */
export interface DatabasePointerCapability {
	readonly kind: 'pointers'
	readonly version: typeof databasePointerCapabilityVersion
}

/** Advertises nested relationship loading without exposing the adapter strategy. */
export interface DatabaseInclusionCapability {
	readonly kind: 'inclusions'
	readonly version: typeof databaseInclusionCapabilityVersion
}

/** Advertises scoped relation reads and atomic logical edge mutations. */
export interface DatabaseRelationCapability {
	readonly kind: 'relations'
	readonly version: typeof databaseRelationCapabilityVersion
}

/** Advertises correlated quantifier and visible-cardinality compilation. */
export interface DatabaseRelationPredicateCapability {
	readonly kind: 'relation-predicates'
	readonly version: typeof databaseRelationPredicateCapabilityVersion
}

/** Lets adapters opt into portable features without coupling Core to a database. */
export interface DatabaseAdapterCapabilities {
	readonly pointers?: DatabasePointerCapability
	readonly inclusions?: DatabaseInclusionCapability
	readonly relations?: DatabaseRelationCapability
	readonly relationPredicates?: DatabaseRelationPredicateCapability
}

/** Reuses one frozen capability declaration across root and transaction adapters. */
export const databasePointerCapability: DatabasePointerCapability =
	immutableRecord({
		kind: 'pointers',
		version: databasePointerCapabilityVersion,
	})

/** Reuses one frozen eager-inclusion declaration across adapter lifetimes. */
export const databaseInclusionCapability: DatabaseInclusionCapability =
	immutableRecord({
		kind: 'inclusions',
		version: databaseInclusionCapabilityVersion,
	})

/** Reuses one frozen relation declaration across root and transaction adapters. */
export const databaseRelationCapability: DatabaseRelationCapability =
	immutableRecord({
		kind: 'relations',
		version: databaseRelationCapabilityVersion,
	})

/** Reuses one frozen relation-predicate declaration across transaction adapters. */
export const databaseRelationPredicateCapability: DatabaseRelationPredicateCapability =
	immutableRecord({
		kind: 'relation-predicates',
		version: databaseRelationPredicateCapabilityVersion,
	})

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
	'count' | 'exists' | 'find-many' | 'find-one' | 'get'
>

/** Narrows the portable adapter boundary to normalized mutation terminals. */
export interface DatabaseMutationOperationAst extends DatabaseOperationAst {
	readonly kind: DatabaseMutationOperationKind
}

/** Recursively lists portable object payloads without retaining class instances. */
export interface DatabaseConstraintPayloadObject {
	readonly [key: string]: DatabaseConstraintPayload
}

/** Lists the portable immutable values accepted inside opaque constraint nodes. */
export type DatabaseConstraintPayload =
	| bigint
	| boolean
	| null
	| number
	| string
	| readonly DatabaseConstraintPayload[]
	| DatabaseConstraintPayloadObject

/** Recursively exposes the detached payload snapshot as immutable data. */
export type ImmutableDatabaseConstraintPayload<
	TPayload extends DatabaseConstraintPayload,
> = TPayload extends bigint | boolean | null | number | string
	? TPayload
	: TPayload extends readonly (infer TItem extends DatabaseConstraintPayload)[]
		? readonly ImmutableDatabaseConstraintPayload<TItem>[]
		: TPayload extends DatabaseConstraintPayloadObject
			? {
					readonly [TKey in keyof TPayload]: ImmutableDatabaseConstraintPayload<
						TPayload[TKey]
					>
				}
			: never

/** Keeps one plugin-owned constraint opaque until an adapter compiler claims it. */
export interface DatabaseConstraintNode<
	TKind extends string = string,
	TVersion extends number = number,
	TPayload extends DatabaseConstraintPayload = DatabaseConstraintPayload,
> {
	/** Names the opaque compiler contract without revealing policy semantics. */
	readonly kind: TKind
	/** Selects the exact payload contract understood by the adapter compiler. */
	readonly version: TVersion
	/** Carries detached portable data that Runtime transports without interpreting. */
	readonly payload: TPayload
}

/** Erases schema inference only after Runtime has validated one private row predicate. */
export type DatabaseRowFilterNode = QueryFilterExpression

/** Identifies one validated logical edge outside the transformable QueryBuilder AST. */
export interface DatabaseRelationReference {
	readonly fieldPath: readonly string[]
	readonly source: SchemaDefinition
	readonly target: SchemaDefinition
}

/** Identifies one validated object-scoped logical edge outside the public AST. */
export interface DatabaseRelationScope extends DatabaseRelationReference {
	readonly sourceObjectId: string
}

/** Carries target policy beside one exact public relation leaf, never inside it. */
export interface DatabaseRelationPredicateScope {
	readonly constraints: readonly DatabaseConstraintNode[]
	readonly predicate: QueryRelationFilterNode
	readonly rowFilter?: DatabaseRowFilterNode
}

/** Carries one target read plan whose physical correlation remains adapter-owned. */
export interface DatabaseInclusionPlan {
	readonly fieldPath: readonly string[]
	readonly kind: 'pointer' | 'relation'
	readonly request: DatabaseOperationRequest
	/** Prevents loading targets whose operation Access was denied. */
	readonly unavailable?: true
}

/**
 * Keeps the normalized operation and accumulated constraints together so an
 * adapter never receives one without the other.
 */
export interface DatabaseOperationRequest<
	TOperation extends DatabaseOperationAst = DatabaseOperationAst,
	TConstraint extends DatabaseConstraintNode = DatabaseConstraintNode,
> {
	readonly constraints: readonly TConstraint[]
	readonly operation: TOperation
	/** Carries one Runtime-validated relation edge only to capable adapters. */
	readonly relation?: DatabaseRelationScope
	/** Keeps target Access monotonic and invisible to source QueryBuilder hooks. */
	readonly relationPredicates?: readonly DatabaseRelationPredicateScope[]
	/** Carries recursively prepared target reads only to eager-inclusion adapters. */
	readonly inclusions?: readonly DatabaseInclusionPlan[]
	/**
	 * Carries framework-owned row restrictions outside the transformable QueryBuilder AST.
	 * Adapters must combine this predicate with the operation predicate using AND.
	 */
	readonly rowFilter?: DatabaseRowFilterNode
}

/** Represents the exact persisted projection returned after query selection. */
export type DatabaseObjectRecord<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema> = never,
> = InferQueryRecord<TSchema, TSelectedField>

/**
 * Reuses the operation result contract so adapters and public terminals
 * cannot drift on selection, nullability, or singular versus bulk semantics.
 */
export type DatabaseOperationResult<TOperation extends OperationAstNode> =
	InferOperationSourceRecordResult<TOperation>

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

/** Exposes only validated materializations to Runtime lifecycle bookkeeping. */
export interface DatabaseMutationMaterializationSource {
	readonly materializations: readonly DatabaseMutationMaterialization[]
}

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
	/** Executes the retained target exactly once with an optional value-only replacement. */
	execute(operation?: TOperation): Promise<DatabaseOperationOutcome<TOperation>>
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
	/** Declares the exact portable protocols implemented by this adapter family. */
	readonly capabilities?: DatabaseAdapterCapabilities
	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>>
	/** Reads adapter-retained identity without placing it in a public projection. */
	readObjectIdentity?(record: Readonly<Record<string, unknown>>): unknown
	/** Reads one raw eager target retained beside an exact parent record. */
	readIncludedValue?(
		record: Readonly<Record<string, unknown>>,
		fieldPath: readonly string[],
	):
		| DatabaseLogicalRecord
		| readonly DatabaseLogicalRecord[]
		| null
		| undefined
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
