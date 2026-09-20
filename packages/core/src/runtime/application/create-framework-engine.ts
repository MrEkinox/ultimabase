import {
	FrameworkApplication,
	type PluginDefinition,
} from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	databasePersistencePlanVersion,
	type DatabasePersistencePlanKind,
} from '../persistence/contracts.js'
import {
	databaseAdapterCapability,
	databasePointerCapabilityVersion,
	type DatabaseAdapter,
} from '../database/contracts.js'
import {
	readApplicationCapability,
	readApplicationCapabilityContributions,
} from '../../plugins/application-capability-access.js'
import { runWithApplicationPluginOwner } from '../../plugins/callback-execution.js'
import { FrameworkEngine } from '../engine/framework-engine.js'
import { createEnforcementStages } from '../enforcement/dispatcher.js'
import type {
	RuntimeOperationTransformStage,
	RuntimePipelineStages,
	RuntimeResultEffectStage,
} from '../pipeline/contracts.js'
import { getRuntimePipelineStageImplementation } from '../pipeline/definitions.js'
import { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import {
	createRuntimeValidationStage,
	normalizeRuntimeValidationOptions,
	type RuntimeValidationOptions,
} from '../validation/runtime-validation.js'
import { createFinalMutationValidationStage } from '../validation/final-mutation-validation.js'
import { MasterAuthority } from '../master/master-authority.js'
import { runtimeInterceptorCapability } from '../capabilities.js'
import { createPersistencePlanRewriteStage } from '../persistence/rewriter-stage.js'
import { composeRuntimeBehaviors } from '../behaviors/composition.js'
import {
	bindRuntimeNestedWrites,
	createRuntimeNestedWriteBinding,
} from '../nested-writes/binding.js'
import {
	applicationRequestExecutionCapability,
	bindApplicationRequestExecutor,
} from './application-request-execution.js'
import { bindRuntimeVirtualFields } from '../virtual-fields/binding.js'
import { bindRuntimeRelationFilters } from '../relation-filters/binding.js'
import { bindFrameworkSchemaMutationRuntime } from '../schema-mutations/engine-integration.js'

/** Configures framework-owned assembly without exposing low-level pipeline slots. */
export interface CreateFrameworkEngineOptions {
	/**
	 * Supplies the optional audited authority used for explicit master access.
	 *
	 * @example `masterAuthority: new MasterAuthority({ keys, onUse })`
	 */
	readonly masterAuthority?: MasterAuthority
	/**
	 * Configures structural validation, application time, and UUID generation.
	 *
	 * @example `validation: { timezone: "Europe/Paris" }`
	 */
	readonly validation?: RuntimeValidationOptions
}

interface CollectedRuntimePipelineStages {
	readonly normalization: readonly RuntimeOperationTransformStage[]
	readonly commit: readonly RuntimeResultEffectStage[]
}

const createFrameworkEngineOptionKeys = new Set([
	'masterAuthority',
	'validation',
])
const emptyCreateFrameworkEngineOptions: CreateFrameworkEngineOptions =
	immutableRecord({})

const neutralNormalization: RuntimeOperationTransformStage = (input) =>
	input.operation
const neutralCommit: RuntimeResultEffectStage = () => undefined

const isObjectLike = (value: unknown): value is object =>
	(typeof value === 'object' && value !== null) || typeof value === 'function'

/** Validates and snapshots Runtime assembly options for deferred application start. */
export const normalizeCreateFrameworkEngineOptions = (
	options: unknown,
): Readonly<CreateFrameworkEngineOptions> => {
	if (!isPlainRecord(options)) {
		throw new TypeError(
			'framework engine factory options must be a plain object',
		)
	}

	for (const key of Object.keys(options)) {
		if (!createFrameworkEngineOptionKeys.has(key)) {
			throw new TypeError(
				`framework engine factory contains unknown key: ${key}`,
			)
		}
	}

	if (
		options.masterAuthority !== undefined &&
		!(options.masterAuthority instanceof MasterAuthority)
	) {
		throw new TypeError(
			'framework engine factory masterAuthority must be a MasterAuthority',
		)
	}

	const validation =
		options.validation === undefined
			? undefined
			: normalizeRuntimeValidationOptions(options.validation)

	return immutableRecord({
		...(options.masterAuthority === undefined
			? {}
			: { masterAuthority: options.masterAuthority }),
		...(validation === undefined ? {} : { validation }),
	})
}

const assertApplicationIsUsable = (
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): void => {
	if (application.state !== 'ready' && application.state !== 'started') {
		throw new TypeError(
			`Framework engine assembly requires a ready or started application; received ${application.state}`,
		)
	}
}

const assertDatabaseAdapter: (
	adapter: unknown,
) => asserts adapter is DatabaseAdapter = (adapter) => {
	if (
		!isObjectLike(adapter) ||
		!('kind' in adapter) ||
		adapter.kind !== 'database-adapter' ||
		!('execute' in adapter) ||
		typeof adapter.execute !== 'function' ||
		!('beginTransaction' in adapter) ||
		typeof adapter.beginTransaction !== 'function'
	) {
		throw new TypeError(
			'databaseAdapterCapability must resolve to a DatabaseAdapter',
		)
	}
}

/** Detects whether static schemas require the portable pointer adapter protocol. */
const applicationUsesPointers = (
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): boolean =>
	application.schemas
		.values()
		.some((schema) =>
			Object.values(schema.persistedFields).some(
				(field) => field.kind === 'pointer',
			),
		)

const readRequiredSchemaMutationPlans = (
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): ReadonlySet<DatabasePersistencePlanKind> => {
	const required = new Set<DatabasePersistencePlanKind>()
	for (const schema of application.schemas.values()) {
		const surface = application.getSchemaSurface(schema.className)
		for (const command of [
			...(surface?.schemaMutations.values() ?? []),
			...(surface?.modelMutations.values() ?? []),
		]) {
			// Schema-mutation protocol 1 locks a visible target through a prepared
			// singular delete shape before choosing its final update or delete effect.
			required.add('delete-one')
			required.add(
				command.mutation.effect === 'update' ? 'update-one' : 'delete-one',
			)
		}
	}
	return required
}

/** Fails during assembly instead of letting a database mis-store logical pointers. */
const assertRequiredAdapterCapabilities = (
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
	adapter: DatabaseAdapter,
): void => {
	if (applicationUsesPointers(application)) {
		const pointers: unknown = adapter.capabilities?.pointers

		if (
			!isPlainRecord(pointers) ||
			pointers.kind !== 'pointers' ||
			pointers.version !== databasePointerCapabilityVersion
		) {
			throw new TypeError(
				`database adapter must implement pointer capability version ${String(databasePointerCapabilityVersion)}`,
			)
		}
	}

	const requiredPlans = readRequiredSchemaMutationPlans(application)
	if (requiredPlans.size > 0) {
		const capability = adapter.capabilities?.persistencePlans
		if (
			capability?.version !== databasePersistencePlanVersion ||
			[...requiredPlans].some((kind) => !capability.kinds.includes(kind))
		) {
			throw new TypeError(
				`database adapter must implement schema mutation persistence plan protocol version ${String(databasePersistencePlanVersion)}`,
			)
		}
	}
}

/** Validates and groups plugin stages while retaining contribution order. */
const collectRuntimePipelineStages = (
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): CollectedRuntimePipelineStages => {
	const normalization: RuntimeOperationTransformStage[] = []
	const commit: RuntimeResultEffectStage[] = []

	for (const contribution of readApplicationCapabilityContributions(
		application,
		runtimeInterceptorCapability,
	)) {
		const implementation = getRuntimePipelineStageImplementation(
			contribution.value,
		)
		if (implementation === undefined) continue

		switch (implementation.stage) {
			case 'normalization':
				normalization.push((input) =>
					runWithApplicationPluginOwner(application, contribution.owner, () =>
						implementation.handler(input),
					),
				)
				break
			case 'commit':
				commit.push((input) =>
					runWithApplicationPluginOwner(application, contribution.owner, () =>
						implementation.handler(input),
					),
				)
				break
		}
	}

	return immutableRecord({
		normalization: immutableArray(normalization),
		commit: immutableArray(commit),
	})
}

const composeNormalizationStage = (
	handlers: readonly RuntimeOperationTransformStage[],
): RuntimeOperationTransformStage => {
	if (handlers.length === 0) {
		return neutralNormalization
	}

	return async (input) => {
		let operation = input.operation

		for (const handler of handlers) {
			operation = await handler(
				immutableRecord({
					context: input.context,
					...(input.nestedWrite === undefined
						? {}
						: { nestedWrite: input.nestedWrite }),
					operation,
				}),
			)
		}

		return operation
	}
}

const composeCommitStage = (
	handlers: readonly RuntimeResultEffectStage[],
): RuntimeResultEffectStage => {
	if (handlers.length === 0) {
		return neutralCommit
	}

	return async (input) => {
		for (const handler of handlers) {
			await handler(input)
		}
	}
}

/** Builds the mandatory Runtime pipeline from one initialized application. */
export const createFrameworkEngine = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	application: FrameworkApplication<TSchemas, TPlugins>,
	options: CreateFrameworkEngineOptions = emptyCreateFrameworkEngineOptions,
): FrameworkEngine<TSchemas, TPlugins> => {
	const untrustedApplication: unknown = application

	if (!(untrustedApplication instanceof FrameworkApplication)) {
		throw new TypeError(
			'framework engine factory application must be a FrameworkApplication',
		)
	}

	const normalizedOptions = normalizeCreateFrameworkEngineOptions(options)
	assertApplicationIsUsable(application)

	const databaseAdapter: unknown = readApplicationCapability(
		application,
		databaseAdapterCapability,
	)

	assertDatabaseAdapter(databaseAdapter)
	assertRequiredAdapterCapabilities(application, databaseAdapter)

	const contributedStages = collectRuntimePipelineStages(application)
	const enforcement = createEnforcementStages(application)
	const persistencePlanRewrite = createPersistencePlanRewriteStage(application)
	const behaviors = composeRuntimeBehaviors(application)
	const structuralValidation =
		normalizedOptions.validation === undefined
			? createRuntimeValidationStage()
			: createRuntimeValidationStage(normalizedOptions.validation)
	const stages: RuntimePipelineStages = {
		normalization: composeNormalizationStage(contributedStages.normalization),
		structuralValidation,
		finalMutationValidation: createFinalMutationValidationStage(),
		databaseOperation: databaseAdapter,
		commit: composeCommitStage(contributedStages.commit),
		...(behaviors === undefined ? {} : { behaviors }),
		...(enforcement === undefined ? {} : { enforcement }),
		...(persistencePlanRewrite === undefined ? {} : { persistencePlanRewrite }),
	}
	// Core constructs the mandatory pipeline directly; plugins contribute its authorized stages.
	const pipeline = new RuntimePipeline(stages)
	bindRuntimeVirtualFields(pipeline, application)
	bindRuntimeRelationFilters(pipeline, application)
	bindRuntimeNestedWrites(
		pipeline,
		createRuntimeNestedWriteBinding(
			application.schemas,
			normalizedOptions.validation,
		),
	)
	const engineOptions =
		normalizedOptions.masterAuthority === undefined
			? { application, pipeline }
			: {
					application,
					pipeline,
					masterAuthority: normalizedOptions.masterAuthority,
				}

	const framework = new FrameworkEngine(engineOptions)
	bindFrameworkSchemaMutationRuntime(framework)
	bindApplicationRequestExecutor(
		readApplicationCapability(
			application,
			applicationRequestExecutionCapability,
		),
		framework,
	)

	return framework
}
