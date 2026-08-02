import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { RuntimePipelineStages } from './contracts.js'

/** Names the plugin-owned pipeline positions supported by application assembly. */
export type RuntimePipelineStageName =
	'acl' | 'clp' | 'commit' | 'fieldPermissions' | 'normalization'

/** Selects the exact handler contract associated with one pipeline position. */
export type RuntimePipelineStageHandler<
	TStage extends RuntimePipelineStageName,
> = RuntimePipelineStages[TStage]

/** Declares one typed handler without exposing it through contribution metadata. */
export interface RuntimePipelineStageOptions<
	TStage extends RuntimePipelineStageName,
> {
	readonly stage: TStage
	readonly handler: RuntimePipelineStageHandler<TStage>
}

declare const runtimePipelineStageType: unique symbol

/** Carries immutable stage identity while its implementation remains private. */
export interface RuntimePipelineStageDefinition<
	TStage extends RuntimePipelineStageName = RuntimePipelineStageName,
> {
	readonly stage: TStage
	readonly [runtimePipelineStageType]?: RuntimePipelineStageHandler<TStage>
}

type RuntimePipelineStageImplementation = {
	[TStage in RuntimePipelineStageName]: {
		readonly stage: TStage
		readonly handler: RuntimePipelineStageHandler<TStage>
	}
}[RuntimePipelineStageName]

const runtimePipelineStageNames = new Set<RuntimePipelineStageName>([
	'acl',
	'clp',
	'commit',
	'fieldPermissions',
	'normalization',
])
const runtimePipelineStageOptionKeys = new Set(['handler', 'stage'])
const runtimePipelineStageImplementations = new WeakMap<
	object,
	RuntimePipelineStageImplementation
>()

const assertRuntimePipelineStageOptions = (options: unknown): void => {
	if (!isPlainRecord(options)) {
		throw new TypeError('runtime pipeline stage options must be a plain object')
	}

	for (const key of Object.keys(options)) {
		if (!runtimePipelineStageOptionKeys.has(key)) {
			throw new TypeError(`runtime pipeline stage contains unknown key: ${key}`)
		}
	}

	if (
		typeof options.stage !== 'string' ||
		!runtimePipelineStageNames.has(options.stage as RuntimePipelineStageName)
	) {
		throw new TypeError(
			`Unknown runtime pipeline stage: ${String(options.stage)}`,
		)
	}

	if (typeof options.handler !== 'function') {
		throw new TypeError('runtime pipeline stage handler must be a function')
	}
}

/** Creates one provenance-protected pipeline contribution for plugin setup. */
export const runtimePipelineStage = <
	const TStage extends RuntimePipelineStageName,
>(
	options: RuntimePipelineStageOptions<TStage>,
): RuntimePipelineStageDefinition<TStage> => {
	const untrustedOptions: unknown = options

	assertRuntimePipelineStageOptions(untrustedOptions)

	const definition: RuntimePipelineStageDefinition<TStage> = immutableRecord({
		stage: options.stage,
	})

	// Runtime validation above establishes the correlated stage and handler pair.
	runtimePipelineStageImplementations.set(
		definition,
		immutableRecord({
			stage: options.stage,
			handler: options.handler,
		}) as RuntimePipelineStageImplementation,
	)

	return definition
}

/** Resolves only definitions produced by the public factory. */
export const getRuntimePipelineStageImplementation = (
	value: unknown,
): RuntimePipelineStageImplementation | undefined =>
	typeof value === 'object' && value !== null
		? runtimePipelineStageImplementations.get(value)
		: undefined
