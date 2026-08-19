import {
	isPluginOperationDefinition,
	operationHandler,
	provideOperationHandler,
	type ApplicationCapabilityFactory,
	type ApplicationCapabilityFactoryContext,
	type PluginOperationDefinition,
	type PluginOperationHandler,
	type PluginOperationHandlerDefinition,
} from '@ultimabase/core'
import {
	assertNonEmptyString,
	isPlainRecord,
	type MaybePromise,
} from '@ultimabase/shared'

interface PluginOperationProviderBase<
	TOperation extends PluginOperationDefinition,
> {
	/** Identifies this provider within its plugin instance. @example "publish-post" */
	readonly contributionId: string
	/** Selects the exact operation whose input and result types reach the handler. */
	readonly operation: TOperation
}

/** Provides a handler that needs only request-scoped operation input. */
export interface DirectPluginOperationProviderOptions<
	TOperation extends PluginOperationDefinition,
> extends PluginOperationProviderBase<TOperation> {
	readonly create?: never
	/** Executes the validated logical operation through Core's Runtime boundary. */
	readonly execute: PluginOperationHandler<TOperation>
}

/** Owns one materialized handler and its optional deterministic cleanup. */
export interface PluginOperationHandlerResource<
	TOperation extends PluginOperationDefinition,
> {
	readonly dispose?: () => MaybePromise<void>
	readonly execute: PluginOperationHandler<TOperation>
}

/** Provides a handler that resolves application capabilities during materialization. */
export interface ResourcePluginOperationProviderOptions<
	TOperation extends PluginOperationDefinition,
> extends PluginOperationProviderBase<TOperation> {
	/** Creates one application-local handler without exposing its resources statically. */
	readonly create: (
		context: ApplicationCapabilityFactoryContext,
	) => MaybePromise<PluginOperationHandlerResource<TOperation>>
	readonly execute?: never
}

/** Configures either a direct or resource-backed operation provider. */
export type PluginOperationProviderOptions<
	TOperation extends PluginOperationDefinition,
> =
	| DirectPluginOperationProviderOptions<TOperation>
	| ResourcePluginOperationProviderOptions<TOperation>

const providerOptionKeys = new Set([
	'contributionId',
	'create',
	'execute',
	'operation',
])

const assertHandlerResource: <TOperation extends PluginOperationDefinition>(
	value: unknown,
) => asserts value is PluginOperationHandlerResource<TOperation> = (value) => {
	if (!isPlainRecord(value)) {
		throw new TypeError('plugin operation resource must be a plain object')
	}
	for (const key of Reflect.ownKeys(value)) {
		if (key !== 'dispose' && key !== 'execute') {
			throw new TypeError(
				`Unknown plugin operation resource option: ${String(key)}`,
			)
		}
	}
	if (typeof value.execute !== 'function') {
		throw new TypeError('plugin operation resource execute must be a function')
	}
	if (value.dispose !== undefined && typeof value.dispose !== 'function') {
		throw new TypeError('plugin operation resource dispose must be a function')
	}
}

/**
 * Flattens Core's application capability, resource, and operation-handler wrappers.
 * The returned provider still receives its real owner and privilege checks from Core.
 *
 * @example
 * ```ts
 * providePluginOperation({
 *   contributionId: 'publish-post',
 *   operation: publishPost,
 *   execute: async ({ input }) => publish(input),
 * })
 * ```
 */
export const providePluginOperation = <
	const TOperation extends PluginOperationDefinition,
>(
	options: PluginOperationProviderOptions<TOperation>,
): ReturnType<typeof provideOperationHandler> => {
	if (!isPlainRecord(options)) {
		throw new TypeError('plugin operation provider must be a plain object')
	}
	for (const key of Reflect.ownKeys(options)) {
		if (typeof key !== 'string' || !providerOptionKeys.has(key)) {
			throw new TypeError(
				`Unknown plugin operation provider option: ${String(key)}`,
			)
		}
	}
	assertNonEmptyString(
		options.contributionId,
		'plugin operation provider contributionId',
	)
	if (!isPluginOperationDefinition(options.operation)) {
		throw new TypeError('plugin operation provider requires an operation token')
	}
	const hasCreate = Object.hasOwn(options, 'create')
	const hasExecute = Object.hasOwn(options, 'execute')
	if (hasCreate === hasExecute) {
		throw new TypeError(
			'plugin operation provider requires exactly one of create or execute',
		)
	}
	const operation = options.operation

	const create: ApplicationCapabilityFactory<
		PluginOperationHandlerDefinition<TOperation>
	> = hasExecute
		? (() => {
				const execute = options.execute
				if (typeof execute !== 'function') {
					throw new TypeError(
						'plugin operation provider execute must be a function',
					)
				}

				return () => ({
					value: operationHandler({ execute, operation }),
				})
			})()
		: (() => {
				const createResource = options.create
				if (typeof createResource !== 'function') {
					throw new TypeError(
						'plugin operation provider create must be a function',
					)
				}

				return async (context) => {
					const resource = await createResource(context)
					assertHandlerResource<TOperation>(resource)
					return {
						value: operationHandler({
							execute: resource.execute,
							operation,
						}),
						...(resource.dispose === undefined
							? {}
							: { dispose: resource.dispose }),
					}
				}
			})()

	return provideOperationHandler({
		contributionId: options.contributionId,
		create,
	})
}
