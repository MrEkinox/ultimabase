import {
	defineCapability,
	type CapabilityToken,
} from '../../plugins/capabilities.js'
import type {
	OperationSourceRecordResult,
	QueryRecord,
	OperationAstNode,
	OperationKind,
	QueryFieldName,
	QueryFilterExpression,
	QueryRelationFilterNode,
	QuerySchemaNode,
} from '../../query/index.js'
import type { SchemaItem, SchemaDefinition } from '../../schema/index.js'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import type {
	DatabasePersistencePlan,
	DatabasePersistencePlanKind,
} from '../persistence/contracts.js'
import { databasePersistencePlanVersion } from '../persistence/contracts.js'

/** Selects the portable pointer protocol currently understood by Core Runtime. */
export const databasePointerCapabilityVersion = 1 as const

/** Selects the eager relationship-inclusion protocol understood by Runtime. */
export const databaseInclusionCapabilityVersion = 1 as const

/** Selects the portable relation protocol currently understood by Core Runtime. */
export const databaseRelationCapabilityVersion = 1 as const

/** Selects the correlated relationship-predicate protocol understood by adapters. */
export const databaseRelationPredicateCapabilityVersion = 4 as const

/** Selects Core's portable plugin-field structural containment protocol. */
export const databasePluginFieldStructuralContainsCapabilityVersion = 1 as const

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

/** Advertises pointer traversal, quantifier, and visible-cardinality compilation. */
export interface DatabaseRelationPredicateCapability {
	readonly kind: 'relation-predicates'
	readonly version: typeof databaseRelationPredicateCapabilityVersion
}

/** Advertises compilation of validated plugin-field containment leaves. */
export interface DatabasePluginFieldStructuralContainsCapability {
	readonly kind: 'plugin-field-structural-contains'
	readonly version: typeof databasePluginFieldStructuralContainsCapabilityVersion
}

/** Advertises exact physical statement kinds and their portable protocol version. */
export interface DatabasePersistencePlanCapability {
	readonly kind: 'persistence-plans'
	readonly kinds: readonly DatabasePersistencePlanKind[]
	readonly version: typeof databasePersistencePlanVersion
}

/** Lets adapters opt into portable features without coupling Core to a database. */
export interface DatabaseAdapterCapabilities {
	readonly pointers?: DatabasePointerCapability
	readonly inclusions?: DatabaseInclusionCapability
	readonly relations?: DatabaseRelationCapability
	readonly relationPredicates?: DatabaseRelationPredicateCapability
	readonly pluginFieldStructuralContains?: DatabasePluginFieldStructuralContainsCapability
	readonly persistencePlans?: DatabasePersistencePlanCapability
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

/** Reuses one frozen portable plugin-field containment declaration. */
export const databasePluginFieldStructuralContainsCapability: DatabasePluginFieldStructuralContainsCapability =
	immutableRecord({
		kind: 'plugin-field-structural-contains',
		version: databasePluginFieldStructuralContainsCapabilityVersion,
	})

/** Advertises Core's complete built-in persistence-plan family. */
export const databasePersistencePlanCapability: DatabasePersistencePlanCapability =
	immutableRecord({
		kind: 'persistence-plans',
		kinds: immutableArray([
			'count',
			'create-many',
			'create-one',
			'delete-many',
			'delete-one',
			'exists',
			'find-many',
			'find-one',
			'get',
			'update-many',
			'update-one',
			'upsert-many',
			'upsert-one',
		]),
		version: databasePersistencePlanVersion,
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

/** Carries private target policy and relation shaping beside one public relation leaf. */
export interface DatabaseRelationPredicateScope {
	readonly predicate: QueryRelationFilterNode
	readonly rowFilter?: DatabaseRowFilterNode
}

/** Carries one target read plan whose physical correlation remains adapter-owned. */
export interface DatabaseInclusionPlan {
	readonly fieldPath: readonly string[]
	readonly kind: 'pointer' | 'relation'
	readonly request: DatabaseOperationRequest
	/** Prevents loading targets denied by protected operation policy. */
	readonly unavailable?: true
}

/** Carries one normalized operation and its physical plan to an adapter. */
export interface DatabaseOperationRequest<
	TOperation extends DatabaseOperationAst = DatabaseOperationAst,
> {
	/** Preserves logical semantics only for result correlation and diagnostics. */
	readonly operation: TOperation
	/** Selects the physical adapter statement independently from logical semantics. */
	readonly plan: DatabasePersistencePlan<TOperation>
	/** Requests stable complete preimages for item-oriented mutation behaviors. */
	readonly prepareMutationItems?: true
	/** Carries one Runtime-validated relation edge only to capable adapters. */
	readonly relation?: DatabaseRelationScope
	/** Keeps target policy monotonic and invisible to source behavior callbacks. */
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
> = QueryRecord<TSchema, TSelectedField>

/**
 * Reuses the operation result contract so adapters and public terminals
 * cannot drift on selection, nullability, or singular versus bulk semantics.
 */
export type DatabaseOperationResult<TOperation extends OperationAstNode> =
	TOperation['kind'] extends 'get'
		? OperationSourceRecordResult<TOperation> | null
		: OperationSourceRecordResult<TOperation>

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
	: Readonly<SchemaItem<DatabaseMutationSchema<TOperation>>>

/** Describes one materialized create independently from public selection. */
export interface DatabaseCreateMaterialization<
	TRecord extends DatabaseLogicalRecord = DatabaseLogicalRecord,
> {
	readonly kind: 'create'
	readonly current: TRecord
}

/** Retains both sides of one materialized update for semantic change behavior. */
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

/** Enumerates the portable logical changes observable by field behavior. */
export type DatabaseMutationMaterialization<
	TOperation extends DatabaseMutationOperationAst =
		DatabaseMutationOperationAst,
> = TOperation['kind'] extends infer TKind
	? TKind extends 'create-many' | 'create-one'
		? DatabaseCreateMaterialization<DatabaseMutationLogicalRecord<TOperation>>
		: TKind extends 'update-many' | 'update-one'
			? DatabaseUpdateMaterialization<DatabaseMutationLogicalRecord<TOperation>>
			: TKind extends 'delete-many' | 'delete-one'
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
	/** Executes the retained target exactly once with the final resolved operation. */
	execute(
		request?: PreparedDatabaseOperationExecution<TOperation>,
	): Promise<DatabaseOperationOutcome<TOperation>>
}

/** Carries the final candidate into one prepared write. */
export interface PreparedDatabaseOperationExecution<
	TOperation extends DatabaseMutationOperationAst,
> {
	readonly operation: TOperation
	readonly plan: DatabasePersistencePlan<TOperation>
}

/** Adds the stable visible preimage when one directed mutation can have one. */
export type PreparedDatabaseOperation<
	TOperation extends DatabaseMutationOperationAst,
> = TOperation extends DatabaseMutationOperationAst
	? PreparedDatabaseOperationHandle<TOperation> &
			(TOperation['kind'] extends 'delete-one' | 'update-one' | 'upsert-one'
				? {
						/** `null` means that no visible persisted object existed at preparation. */
						readonly target: DatabaseMutationLogicalRecord<TOperation> | null
					}
				: { readonly target?: never }) &
			(TOperation['kind'] extends 'delete-many' | 'update-many'
				? {
						/** Exists only when Runtime requested stable set-based item preimages. */
						readonly targets?: readonly DatabaseMutationLogicalRecord<TOperation>[]
					}
				: { readonly targets?: never })
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
	): DatabaseLogicalRecord | readonly DatabaseLogicalRecord[] | null | undefined
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
	/** Prepares one stable mutation target before affected-field behavior executes. */
	prepare<const TOperation extends DatabaseMutationOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<PreparedDatabaseOperation<TOperation>>
	commit(): Promise<void>
	rollback(): Promise<void>
}

/** Identifies the single database adapter implementation owned by each application. */
export const databaseAdapterCapability: CapabilityToken<
	DatabaseAdapter,
	DatabaseAdapter,
	'ultimabase.database-adapter',
	'1.0.0',
	'single',
	'application'
> = defineCapability<DatabaseAdapter>()({
	capabilityId: 'ultimabase.database-adapter',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => provider,
})

/** Checks one adapter-shaped value by its nominal kind and required methods. */
const hasExecutorShape = (
	value: object,
	kind: string,
	methods: readonly string[],
): boolean =>
	Reflect.get(value, 'kind') === kind &&
	methods.every((method) => typeof Reflect.get(value, method) === 'function')

/** @internal Recognizes a root adapter before Runtime assembly or a transaction. */
export const isDatabaseAdapter = (value: unknown): value is DatabaseAdapter =>
	((typeof value === 'object' && value !== null) ||
		typeof value === 'function') &&
	hasExecutorShape(value, 'database-adapter', ['execute', 'beginTransaction'])

/** @internal Validates a plugin-owned transaction before any callback receives it. */
export const isDatabaseTransactionAdapter = (
	value: unknown,
): value is DatabaseTransactionAdapter =>
	typeof value === 'object' &&
	value !== null &&
	hasExecutorShape(value, 'database-transaction-adapter', [
		'execute',
		'prepare',
		'commit',
		'rollback',
	])
