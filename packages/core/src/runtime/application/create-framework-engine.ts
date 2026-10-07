import { FrameworkApplication } from '../../application/framework-application.js'
import type { PluginDefinition } from '../../foundation.js'
import { assertExactEnumerablePlainObject } from '../../exact-object-validation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import {
	databasePersistencePlanVersion,
	type DatabasePersistencePlanKind,
} from '../persistence/contracts.js'
import {
	databaseAdapterCapability,
	databasePointerCapabilityVersion,
	isDatabaseAdapter,
	type DatabaseAdapter,
} from '../database/contracts.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { FrameworkEngine } from '../engine/framework-engine.js'
import { createEnforcementStages } from '../enforcement/dispatcher.js'
import type {
	RuntimeOperationTransformStage,
	RuntimePipelineStages,
	RuntimeResultEffectStage,
} from '../pipeline/contracts.js'
import { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import {
	createRuntimeValidationStage,
	normalizeRuntimeValidationOptions,
	type RuntimeValidationOptions,
} from '../validation/runtime-validation.js'
import { createFinalMutationValidationStage } from '../validation/final-mutation-validation.js'
import { MasterAuthority } from '../master/master-authority.js'
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
import {
	bindRuntimeRelationFilters,
	bindRuntimeVirtualFields,
} from '../pipeline/application-bindings.js'
import { assertSchemaMutationHandlers } from '../schema-mutations/runtime.js'

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

const createFrameworkEngineOptionKeys = new Set([
	'masterAuthority',
	'validation',
])
const emptyCreateFrameworkEngineOptions: CreateFrameworkEngineOptions =
	immutableRecord({})

type AnyFrameworkApplication = FrameworkApplication<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
>

const neutralNormalization: RuntimeOperationTransformStage = (input) =>
	input.operation
const neutralCommit: RuntimeResultEffectStage = () => undefined

/** Validates and snapshots Runtime assembly options for deferred application start. */
export const normalizeCreateFrameworkEngineOptions = (
	options: unknown,
): Readonly<CreateFrameworkEngineOptions> => {
	assertExactEnumerablePlainObject(
		options,
		createFrameworkEngineOptionKeys,
		'framework engine factory options must be a plain object',
		'framework engine factory contains unknown key: ',
	)

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
	application: AnyFrameworkApplication,
): void => {
	if (application.state !== 'ready' && application.state !== 'started') {
		throw new TypeError(
			`Framework engine assembly requires a ready or started application; received ${application.state}`,
		)
	}
}

/** Detects whether static schemas require the portable pointer adapter protocol. */
const applicationUsesPointers = (
	application: AnyFrameworkApplication,
): boolean =>
	application.schemas
		.values()
		.some((schema) =>
			Object.values(schema.persistedFields).some(
				(field) => field.kind === 'pointer',
			),
		)

const readRequiredSchemaMutationPlans = (
	application: AnyFrameworkApplication,
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
	application: AnyFrameworkApplication,
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

	const databaseAdapter: unknown = readApplicationKernelState(
		application,
	).capability(databaseAdapterCapability)

	if (!isDatabaseAdapter(databaseAdapter)) {
		throw new TypeError(
			'databaseAdapterCapability must resolve to a DatabaseAdapter',
		)
	}
	assertRequiredAdapterCapabilities(application, databaseAdapter)

	const enforcement = createEnforcementStages(application)
	const persistencePlanRewrite = createPersistencePlanRewriteStage(application)
	const behaviors = composeRuntimeBehaviors(application)
	const structuralValidation =
		normalizedOptions.validation === undefined
			? createRuntimeValidationStage()
			: createRuntimeValidationStage(normalizedOptions.validation)
	const stages: RuntimePipelineStages = {
		normalization: neutralNormalization,
		structuralValidation,
		finalMutationValidation: createFinalMutationValidationStage(),
		databaseOperation: databaseAdapter,
		commit: neutralCommit,
		...(behaviors === undefined ? {} : { behaviors }),
		...(enforcement === undefined ? {} : { enforcement }),
		...(persistencePlanRewrite === undefined ? {} : { persistencePlanRewrite }),
	}
	// Assembly owns normalization and commit; plugins contribute only the supported behavior boundaries.
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
	assertSchemaMutationHandlers(application)
	bindApplicationRequestExecutor(
		readApplicationKernelState(application).capability(
			applicationRequestExecutionCapability,
		),
		framework,
	)

	return framework
}
