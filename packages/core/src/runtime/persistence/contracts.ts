import type {
	DatabaseOperationAst,
	DatabaseOperationResult,
} from '../database/contracts.js'
import type {
	QueryAst,
	QueryInclusionNode,
	QuerySchemaNode,
	QuerySelectionNode,
	UniqueUpsertTargetNode,
	UpdateExpressionNode,
} from '../../query/index.js'
import type { PluginIdentity } from '../../plugins/manifest.js'
import type { MaybePromise } from '@ultimabase/shared'

/** Selects the portable physical-plan protocol understood by Core Runtime. */
export const databasePersistencePlanVersion = 1 as const

/** Enumerates the physical statement families supported by protocol version 1. */
export type DatabasePersistencePlanKind =
	| 'count'
	| 'create-many'
	| 'create-one'
	| 'delete-many'
	| 'delete-one'
	| 'exists'
	| 'find-many'
	| 'find-one'
	| 'get'
	| 'update-many'
	| 'update-one'
	| 'upsert-many'
	| 'upsert-one'

/** Pins every physical statement to one compiled logical schema identity. */
export interface DatabasePersistenceTarget {
	readonly schema: QuerySchemaNode
}

/** Records Core and every authorized rewriter without accepting self-asserted ownership. */
export interface DatabasePersistenceProvenance {
	readonly contributionId: string
	readonly owner: PluginIdentity
	readonly pluginVersion: string
	readonly protocolVersion: typeof databasePersistencePlanVersion
}

/** Pins the public result contract to the preserved logical operation. */
export interface DatabasePersistenceReturning<
	TOperation extends DatabaseOperationAst = DatabaseOperationAst,
> {
	readonly inclusion: QueryInclusionNode
	readonly operationKind: TOperation['kind']
	readonly selection: QuerySelectionNode
	/** Retains the exact adapter result correlation as a type-only contract. */
	readonly result?: DatabaseOperationResult<TOperation>
}

interface QueryPersistenceData {
	readonly query: QueryAst
}

interface GetPersistenceData extends QueryPersistenceData {
	readonly id: string
}

interface CreateOnePersistenceData {
	readonly input: Readonly<Record<string, unknown>>
}

interface CreateManyPersistenceData {
	readonly inputs: readonly Readonly<Record<string, unknown>>[]
}

interface UpdatePersistenceData extends QueryPersistenceData {
	readonly update: UpdateExpressionNode
}

interface UpsertOnePersistenceData extends UpdatePersistenceData {
	readonly create: Readonly<Record<string, unknown>>
	readonly uniqueTarget: UniqueUpsertTargetNode
}

type UpsertManyPersistenceItem = UpsertOnePersistenceData

interface UpsertManyPersistenceData {
	readonly items: readonly UpsertManyPersistenceItem[]
}

interface DatabasePersistencePlanBase<
	TKind extends DatabasePersistencePlanKind,
	TData,
	TOperation extends DatabaseOperationAst,
> {
	readonly data: TData
	readonly kind: TKind
	readonly provenance: readonly DatabasePersistenceProvenance[]
	readonly returning: DatabasePersistenceReturning<TOperation>
	readonly target: DatabasePersistenceTarget
	readonly version: typeof databasePersistencePlanVersion
}

type QueryPersistencePlan<
	TKind extends
		| 'count'
		| 'delete-many'
		| 'delete-one'
		| 'exists'
		| 'find-many'
		| 'find-one',
	TOperation extends DatabaseOperationAst,
> = DatabasePersistencePlanBase<TKind, QueryPersistenceData, TOperation>

/** Represents every immutable physical statement accepted by protocol version 1. */
export type DatabasePersistencePlan<
	TOperation extends DatabaseOperationAst = DatabaseOperationAst,
> =
	| QueryPersistencePlan<'count', TOperation>
	| DatabasePersistencePlanBase<
			'create-many',
			CreateManyPersistenceData,
			TOperation
	  >
	| DatabasePersistencePlanBase<
			'create-one',
			CreateOnePersistenceData,
			TOperation
	  >
	| QueryPersistencePlan<'delete-many', TOperation>
	| QueryPersistencePlan<'delete-one', TOperation>
	| QueryPersistencePlan<'exists', TOperation>
	| QueryPersistencePlan<'find-many', TOperation>
	| QueryPersistencePlan<'find-one', TOperation>
	| DatabasePersistencePlanBase<'get', GetPersistenceData, TOperation>
	| DatabasePersistencePlanBase<
			'update-many',
			UpdatePersistenceData,
			TOperation
	  >
	| DatabasePersistencePlanBase<'update-one', UpdatePersistenceData, TOperation>
	| DatabasePersistencePlanBase<
			'upsert-many',
			UpsertManyPersistenceData,
			TOperation
	  >
	| DatabasePersistencePlanBase<
			'upsert-one',
			UpsertOnePersistenceData,
			TOperation
	  >

/** Supplies a rewriter with logical intent and no protected constraint state. */
export interface DatabasePersistenceRewriteInput<
	TOperation extends DatabaseOperationAst = DatabaseOperationAst,
> {
	readonly logicalOperation: TOperation
	readonly plan: DatabasePersistencePlan<TOperation>
}

/** Applies every authorized application-local rewrite in graph order. */
export type RuntimePersistencePlanRewriteStage = <
	const TOperation extends DatabaseOperationAst,
>(
	input: DatabasePersistenceRewriteInput<TOperation>,
) => MaybePromise<DatabasePersistencePlan<TOperation>>
