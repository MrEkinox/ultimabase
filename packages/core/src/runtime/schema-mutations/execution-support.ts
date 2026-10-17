import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { PluginSchemaMutationEnvelope } from '../../application/application-schema-mutations.js'
import type { CompiledMutationCommand } from '../../plugins/command-graph.js'
import type {
	DeleteOneOperationAst,
	QueryExpressionNode,
	UpdateExpressionNode,
	UpdateOneOperationAst,
} from '../../query/index.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { RuntimeBehaviorBoundaries } from '../behaviors/validation-boundaries.js'
import type { RequestContext } from '../context/request-context.js'
import type {
	DatabaseOperationOutcome,
	DatabaseTransactionAdapter,
} from '../database/contracts.js'
import type { EnforcementState } from '../enforcement/state.js'
import type { DatabasePersistencePlan } from '../persistence/contracts.js'
import type { RuntimePipelineStages } from '../pipeline/contracts.js'
import type { RuntimeInclusionProjector } from '../pipeline/inclusion-projection.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import type { RuntimeVirtualFieldScheduler } from '../virtual-fields/execution.js'
import type { PluginSchemaMutationOperationAst } from './contracts.js'

export interface SchemaMutationPipelineBinding {
	readonly boundaries: RuntimeBehaviorBoundaries
	readonly inclusions: RuntimeInclusionProjector
	readonly stages: Readonly<RuntimePipelineStages>
}

export interface RuntimeSchemaMutationRequest {
	readonly application: object
	readonly command: CompiledMutationCommand
	readonly context: RequestContext
	readonly envelope: PluginSchemaMutationEnvelope
	readonly schema: SchemaDefinition
}

export interface RuntimeSchemaMutationResult {
	readonly operation: SchemaMutationPhysicalOperation
	readonly outcome: SchemaMutationOutcome
	readonly result: Readonly<Record<string, unknown>>
}

export type SchemaMutationDeleteOperation = DeleteOneOperationAst<
	SchemaDefinition,
	QueryExpressionNode
>
export type SchemaMutationUpdateOperation = UpdateOneOperationAst<
	SchemaDefinition,
	UpdateExpressionNode,
	QueryExpressionNode
>
export type SchemaMutationPhysicalOperation =
	SchemaMutationDeleteOperation | SchemaMutationUpdateOperation
export type SchemaMutationOutcome =
	| DatabaseOperationOutcome<SchemaMutationDeleteOperation>
	| DatabaseOperationOutcome<SchemaMutationUpdateOperation>

export interface SchemaMutationPreparedOperation {
	readonly target: Readonly<Record<string, unknown>> | null
	execute(request: {
		readonly operation: SchemaMutationPhysicalOperation
		readonly plan: DatabasePersistencePlan
	}): Promise<SchemaMutationOutcome>
}

const pipelineBindings = new WeakMap<
	RuntimePipeline,
	SchemaMutationPipelineBinding
>()

/** @internal Installs Core-owned collaborators without exposing pipeline state. */
export const registerRuntimeSchemaMutationPipeline = (
	pipeline: RuntimePipeline,
	binding: SchemaMutationPipelineBinding,
): void => {
	pipelineBindings.set(pipeline, binding)
}

/** @internal Reads the collaborators bound to one pipeline. */
export const readRuntimeSchemaMutationBinding = (
	pipeline: RuntimePipeline,
): SchemaMutationPipelineBinding | undefined => pipelineBindings.get(pipeline)

/** @internal Reads the stages bound to one pipeline for many-row target resolution. */
export const readRuntimeSchemaMutationStages = (
	pipeline: RuntimePipeline,
): Readonly<RuntimePipelineStages> | undefined =>
	pipelineBindings.get(pipeline)?.stages

export const readPreparedTarget = (
	prepared: SchemaMutationPreparedOperation,
): Readonly<Record<string, unknown>> | null => {
	const candidate: unknown = prepared
	if (!isPlainRecord(candidate) || !Object.hasOwn(candidate, 'target')) {
		throw new TypeError(
			'Prepared schema mutation must expose its complete target',
		)
	}
	const target: unknown = candidate.target
	if (target !== null && !isPlainRecord(target)) {
		throw new TypeError('Prepared schema mutation target must be a record')
	}
	return target
}

/** Keeps the identity and the selected fields of one record, in record order. */
export const pickFields = (
	record: Readonly<Record<string, unknown>>,
	fields: readonly string[],
): Readonly<Record<string, unknown>> => {
	const selected = new Set(['id', ...fields])
	return immutableRecord(
		Object.fromEntries(
			Object.entries(record).filter(([field]) => selected.has(field)),
		),
	)
}

export const assertLogicalIdentity: (
	command: CompiledMutationCommand,
	schema: SchemaDefinition,
	envelope: PluginSchemaMutationEnvelope,
	operation: unknown,
) => asserts operation is PluginSchemaMutationOperationAst = (
	command,
	schema,
	envelope,
	operation,
) => {
	if (
		!isPlainRecord(operation) ||
		operation.kind !== 'plugin-schema-mutation' ||
		operation.command !== envelope.command ||
		operation.id !== envelope.id ||
		operation.mutation !== command.definition ||
		operation.owner !== command.owner ||
		!isPlainRecord(operation.query) ||
		!isPlainRecord(operation.query.schema) ||
		operation.query.schema.definition !== schema
	) {
		throw new TypeError(
			'Runtime enforcement must retain the exact schema mutation identity',
		)
	}
}

export const preparePhysicalOperation = (
	logical: PluginSchemaMutationOperationAst,
): SchemaMutationDeleteOperation =>
	immutableRecord({ kind: 'delete-one' as const, query: logical.query })

export const createPhysicalOperation = (
	logical: PluginSchemaMutationOperationAst,
): SchemaMutationPhysicalOperation => {
	if (logical.effect?.kind === 'update') {
		const operation: SchemaMutationUpdateOperation = immutableRecord({
			kind: 'update-one',
			query: logical.query,
			update: logical.effect.update,
		})
		return operation
	}
	const operation: SchemaMutationDeleteOperation = immutableRecord({
		kind: 'delete-one',
		query: logical.query,
	})
	return operation
}

export const emptyStageInput: Readonly<Record<never, never>> = immutableRecord(
	{},
)

/** Builds one stage envelope of a plugin schema mutation. */
export const createStageInput = <const TExtra extends object>(
	context: RequestContext,
	operation: PluginSchemaMutationOperationAst,
	extra: TExtra,
): Readonly<
	{
		readonly context: RequestContext
		readonly operation: PluginSchemaMutationOperationAst
	} & TExtra
> => immutableRecord({ context, operation, ...extra })

/** One schema mutation whose target is locked and item-checked, not yet resolved. */
export interface LockedSchemaMutation {
	readonly binding: SchemaMutationPipelineBinding
	readonly enforcement: EnforcementState | undefined
	readonly executor: DatabaseTransactionAdapter
	readonly logical: PluginSchemaMutationOperationAst
	readonly original: Readonly<Record<string, unknown>>
	readonly prepared: SchemaMutationPreparedOperation
	readonly request: RuntimeSchemaMutationRequest
	readonly virtualScheduler: RuntimeVirtualFieldScheduler | undefined
}
