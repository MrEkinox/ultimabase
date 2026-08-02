import {
	FrameworkApplication,
	FrameworkError,
	type PluginContribution,
	type PluginDefinition,
} from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	databaseAdapterServiceToken,
	type DatabaseAdapter,
} from '../database/contracts.js'
import { FrameworkEngine } from '../engine/framework-engine.js'
import { createRuntimeHookStages } from '../hooks/stages.js'
import type {
	RuntimeAccessConstraintStage,
	RuntimeFieldPermissionStage,
	RuntimeOperationGuardStage,
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
import { MasterAuthority } from '../master/master-authority.js'

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

type ExclusiveRuntimePipelineStageName = 'acl' | 'clp' | 'fieldPermissions'

interface CollectedRuntimePipelineStages {
	readonly normalization: readonly RuntimeOperationTransformStage[]
	readonly commit: readonly RuntimeResultEffectStage[]
	readonly acl: RuntimeAccessConstraintStage | undefined
	readonly clp: RuntimeOperationGuardStage | undefined
	readonly fieldPermissions: RuntimeFieldPermissionStage | undefined
}

const createFrameworkEngineOptionKeys = new Set([
	'masterAuthority',
	'validation',
])
const emptyCreateFrameworkEngineOptions: CreateFrameworkEngineOptions =
	immutableRecord({})

const neutralNormalization: RuntimeOperationTransformStage = (input) =>
	input.operation
const neutralClp: RuntimeOperationGuardStage = () => undefined
const neutralAcl: RuntimeAccessConstraintStage = (input) =>
	input.accessConstraints
const neutralFieldPermissions: RuntimeFieldPermissionStage = (input) =>
	immutableRecord({
		operation: input.operation,
		accessConstraints: input.accessConstraints,
	})
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
			'databaseAdapterServiceToken must resolve to a DatabaseAdapter',
		)
	}
}

const claimExclusiveStage = (
	stage: ExclusiveRuntimePipelineStageName,
	contribution: PluginContribution,
	owners: Map<ExclusiveRuntimePipelineStageName, PluginContribution>,
): void => {
	const existingOwner = owners.get(stage)

	if (existingOwner !== undefined) {
		throw new FrameworkError(
			'PLUGIN_CONFLICT',
			`Runtime pipeline stage "${stage}" is already owned by plugin "${existingOwner.ownerPlugin}".`,
			{
				internalDetails: {
					kind: 'duplicate-runtime-pipeline-stage',
					stage,
					pluginNames: immutableArray([
						existingOwner.ownerPlugin,
						contribution.ownerPlugin,
					]),
				},
			},
		)
	}

	owners.set(stage, contribution)
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
	const exclusiveOwners = new Map<
		ExclusiveRuntimePipelineStageName,
		PluginContribution
	>()
	let acl: RuntimeAccessConstraintStage | undefined
	let clp: RuntimeOperationGuardStage | undefined
	let fieldPermissions: RuntimeFieldPermissionStage | undefined

	for (const contribution of application.getContributions('pipelines')) {
		const implementation = getRuntimePipelineStageImplementation(
			contribution.value,
		)

		if (implementation === undefined) {
			throw new TypeError(
				`Plugin "${contribution.ownerPlugin}" registered invalid runtime pipeline contribution "${contribution.name}"`,
			)
		}

		switch (implementation.stage) {
			case 'normalization':
				normalization.push(implementation.handler)
				break
			case 'commit':
				commit.push(implementation.handler)
				break
			case 'acl':
				claimExclusiveStage('acl', contribution, exclusiveOwners)
				acl = implementation.handler
				break
			case 'clp':
				claimExclusiveStage('clp', contribution, exclusiveOwners)
				clp = implementation.handler
				break
			case 'fieldPermissions':
				claimExclusiveStage('fieldPermissions', contribution, exclusiveOwners)
				fieldPermissions = implementation.handler
				break
		}
	}

	return immutableRecord({
		normalization: immutableArray(normalization),
		commit: immutableArray(commit),
		acl,
		clp,
		fieldPermissions,
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
				immutableRecord({ context: input.context, operation }),
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

	const databaseAdapter: unknown = application.getService(
		databaseAdapterServiceToken,
	)

	assertDatabaseAdapter(databaseAdapter)

	const contributedStages = collectRuntimePipelineStages(application)
	const hookStages = createRuntimeHookStages(application)
	const structuralValidation =
		normalizedOptions.validation === undefined
			? createRuntimeValidationStage()
			: createRuntimeValidationStage(normalizedOptions.validation)
	const stages: RuntimePipelineStages = {
		normalization: composeNormalizationStage(contributedStages.normalization),
		structuralValidation,
		clp: contributedStages.clp ?? neutralClp,
		acl: contributedStages.acl ?? neutralAcl,
		fieldPermissions:
			contributedStages.fieldPermissions ?? neutralFieldPermissions,
		globalBeforeHooks: hookStages.globalBeforeHooks,
		schemaBeforeHooks: hookStages.schemaBeforeHooks,
		databaseOperation: databaseAdapter,
		schemaAfterHooks: hookStages.schemaAfterHooks,
		globalAfterHooks: hookStages.globalAfterHooks,
		commit: composeCommitStage(contributedStages.commit),
		postCommitEvents: hookStages.postCommitEvents,
	}
	const pipeline = new RuntimePipeline(stages)
	const engineOptions =
		normalizedOptions.masterAuthority === undefined
			? { application, pipeline }
			: {
					application,
					pipeline,
					masterAuthority: normalizedOptions.masterAuthority,
				}

	return new FrameworkEngine(engineOptions)
}
