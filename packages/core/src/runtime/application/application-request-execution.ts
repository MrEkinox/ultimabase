import type {
	AnonymousRequestAccess,
	MasterRequestAccess,
} from '../../access/index.js'
import { FrameworkError } from '../../errors/framework-error.js'
import {
	executeOperation,
	normalizeOperationOptions,
} from '../../query/operations/execution.js'
import type { OperationAstNode } from '../../query/operations/contracts.js'
import type { ReadOperationKind } from '../../query/operations/read-normalization.js'
import type { OperationResult } from '../../query/operations/results.js'
import type { SchemaDefinition } from '../../schema/index.js'
import {
	defineCapability,
	type CapabilityToken,
} from '../../plugins/capability-token.js'
import {
	provideCapability,
	type CapabilityProviderDeclaration,
} from '../../plugins/capability-providers.js'
import { readApplicationPluginOwner } from '../../plugins/callback-execution.js'
import type { PluginIdentity } from '../../plugins/manifest.js'
import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import { runWithRequestEngine } from '../context/active-framework-context.js'
import type {
	RequestContext,
	RequestContextOptions,
} from '../context/request-context.js'
import {
	assertApplicationEngineAvailable,
	assertApplicationRequestExecutionAvailable,
} from '../engine/application-binding.js'
import type { FrameworkEngine } from '../engine/framework-engine.js'
import { assertMasterElevationPrivilege } from '../engine/framework-master-authority.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'
import { reportFrameworkPublicTransportProtection } from '../plugin-operations/engine-integration.js'
import type {
	ApplicationOperationTransport,
	OperationTransportExposureOptions,
	PublicTransportProtectionOptions,
} from '../plugin-operations/transport.js'
import {
	executeApplicationSchemaMutation,
	type ApplicationSchemaMutationRequest,
	type ApplicationSchemaMutationResult,
} from './application-schema-mutation-execution.js'
import type {
	ApplicationSchemaMutationTransport,
	SchemaMutationTransportExposureOptions,
} from '../schema-mutations/transport.js'
import { exposeFrameworkSchemaMutations } from '../schema-mutations/transport-exposure.js'

/** Carries one raw credential only for immediate application-owned verification. */
export interface ApplicationMasterKeyVerificationOptions<
	TSource extends string = string,
> {
	readonly context: RequestContext<AnonymousRequestAccess, TSource>
	readonly rawKey: string
	/** Describes the audited transport purpose without containing credential data. */
	readonly reason: string
}

/**
 * Lets an attributed transport enter one application without exposing its
 * engine, authority, adapter, transaction, or lifecycle controls.
 */
export interface ApplicationRequestExecutor {
	/** Creates and application-binds one immutable anonymous request context. */
	createAnonymousContext<const TSource extends string>(
		options: RequestContextOptions<TSource>,
	): RequestContext<AnonymousRequestAccess, TSource>
	/** Runs one attributed callback in the request's exact asynchronous scope. */
	runWithContext<TContext extends RequestContext, TResult>(
		context: TContext,
		callback: (context: TContext) => TResult,
	): TResult
	/** Executes one normalized schema read with the exact application context. */
	executeRead<const TOperation extends OperationAstNode>(
		context: RequestContext,
		operation: TOperation &
			(TOperation['kind'] extends ReadOperationKind ? unknown : never),
	): Promise<OperationResult<TOperation>>
	/** Executes one schema mutation through the canonical schema-command boundary. */
	executeMutation<
		const TSchema extends SchemaDefinition,
		const TRequest extends ApplicationSchemaMutationRequest<TSchema>,
	>(
		context: RequestContext,
		schema: TSchema,
		request: TRequest,
	): Promise<ApplicationSchemaMutationResult<TRequest>>
	/** Verifies, audits, and derives Master authority without exposing its grant. */
	verifyMasterKey<const TSource extends string>(
		options: ApplicationMasterKeyVerificationOptions<TSource>,
	): Promise<RequestContext<MasterRequestAccess, TSource>>
	/** Constructs one immutable allowlist for explicitly bound plugin operations. */
	exposeOperations<const TTransport extends OperationTransportProtocol>(
		options: OperationTransportExposureOptions<TTransport>,
	): ApplicationOperationTransport<TTransport>
	/** Constructs one immutable allowlist for bound schema-local mutations. */
	exposeSchemaMutations<const TTransport extends OperationTransportProtocol>(
		options: SchemaMutationTransportExposureOptions<TTransport>,
	): ApplicationSchemaMutationTransport<TTransport>
	/** Reports or acknowledges Core's shared public-protection uncertainty. */
	reportPublicTransportProtection<
		const TTransport extends OperationTransportProtocol,
	>(
		options: PublicTransportProtectionOptions<TTransport>,
	): void
}

interface ApplicationRequestExecutorState {
	disposed: boolean
	framework: FrameworkEngine | undefined
}

const applicationRequestExecutorStates = new WeakMap<
	ApplicationRequestExecutor,
	ApplicationRequestExecutorState
>()
const masterVerificationOptionKeys = new Set(['context', 'rawKey', 'reason'])

const readExecutorState = (
	executor: ApplicationRequestExecutor,
): ApplicationRequestExecutorState => {
	const state = applicationRequestExecutorStates.get(executor)
	if (state === undefined) {
		throw new TypeError('Unknown application request executor')
	}
	if (state.disposed) {
		throw new TypeError('Application request executor is no longer available')
	}
	return state
}

const readBoundFramework = (
	executor: ApplicationRequestExecutor,
	requireStarted: boolean,
): FrameworkEngine => {
	const state = readExecutorState(executor)
	if (state.framework === undefined) {
		throw new TypeError('Application request executor is not bound')
	}
	if (requireStarted) {
		assertApplicationRequestExecutionAvailable(state.framework.application)
	} else {
		assertApplicationEngineAvailable(state.framework.application)
	}
	return state.framework
}

const requireAttributedOwner = (framework: FrameworkEngine): PluginIdentity => {
	const owner = readApplicationPluginOwner(framework.application)
	if (owner !== undefined) return owner

	throw new FrameworkError(
		'PLUGIN_PRIVILEGE_DENIED',
		'Application request execution requires an attributed plugin callback.',
		{
			internalDetails: {
				kind: 'application-request-callback-owner-missing',
			},
		},
	)
}

const assertMasterVerificationOptions: (
	options: unknown,
) => asserts options is ApplicationMasterKeyVerificationOptions = (options) => {
	if (!isPlainRecord(options)) {
		throw new TypeError(
			'Master key verification options must be a plain object',
		)
	}
	for (const key of Object.keys(options)) {
		if (!masterVerificationOptionKeys.has(key)) {
			throw new TypeError(
				`Master key verification contains unknown option: ${key}`,
			)
		}
	}
	assertNonEmptyString(options.rawKey, 'Master key')
	assertNonEmptyString(options.reason, 'Master key verification reason')
}

class CoreApplicationRequestExecutor implements ApplicationRequestExecutor {
	createAnonymousContext<const TSource extends string>(
		options: RequestContextOptions<TSource>,
	): RequestContext<AnonymousRequestAccess, TSource> {
		const framework = readBoundFramework(this, true)
		requireAttributedOwner(framework)
		return framework.anonymous(options).context
	}

	runWithContext<TContext extends RequestContext, TResult>(
		context: TContext,
		callback: (context: TContext) => TResult,
	): TResult {
		const framework = readBoundFramework(this, true)
		requireAttributedOwner(framework)
		if (typeof callback !== 'function') {
			throw new TypeError('Application request callback must be a function')
		}
		const request = framework.withContext(context)
		throwIfOperationCancelled(request.context.signal, {
			phase: 'application-request-execution',
		})
		return runWithRequestEngine(request, () => callback(context))
	}

	executeRead<const TOperation extends OperationAstNode>(
		context: RequestContext,
		operation: TOperation &
			(TOperation['kind'] extends ReadOperationKind ? unknown : never),
	): Promise<OperationResult<TOperation>> {
		const framework = readBoundFramework(this, true)
		requireAttributedOwner(framework)
		const request = framework.withContext(context)
		throwIfOperationCancelled(request.context.signal, {
			phase: 'application-request-read-execution',
		})
		return runWithRequestEngine(request, () =>
			executeOperation(operation, normalizeOperationOptions(undefined)),
		)
	}

	executeMutation<
		const TSchema extends SchemaDefinition,
		const TRequest extends ApplicationSchemaMutationRequest<TSchema>,
	>(
		context: RequestContext,
		schema: TSchema,
		request: TRequest,
	): Promise<ApplicationSchemaMutationResult<TRequest>> {
		const framework = readBoundFramework(this, true)
		requireAttributedOwner(framework)
		const scoped = framework.withContext(context)
		throwIfOperationCancelled(scoped.context.signal, {
			phase: 'application-request-mutation-execution',
		})

		return runWithRequestEngine(scoped, () =>
			executeApplicationSchemaMutation(schema, request),
		)
	}

	async verifyMasterKey<const TSource extends string>(
		options: ApplicationMasterKeyVerificationOptions<TSource>,
	): Promise<RequestContext<MasterRequestAccess, TSource>> {
		assertMasterVerificationOptions(options)
		const framework = readBoundFramework(this, true)
		requireAttributedOwner(framework)
		assertMasterElevationPrivilege(framework.application)
		const request = framework.withContext(options.context)
		const grant = framework.authorizeMasterKey(options.rawKey)
		const master = await request.useMasterKey(grant, options.reason)
		return master.context
	}

	exposeOperations<const TTransport extends OperationTransportProtocol>(
		options: OperationTransportExposureOptions<TTransport>,
	): ApplicationOperationTransport<TTransport> {
		const framework = readBoundFramework(this, false)
		requireAttributedOwner(framework)
		return framework.exposeOperations(options)
	}

	exposeSchemaMutations<const TTransport extends OperationTransportProtocol>(
		options: SchemaMutationTransportExposureOptions<TTransport>,
	): ApplicationSchemaMutationTransport<TTransport> {
		const framework = readBoundFramework(this, false)
		requireAttributedOwner(framework)
		return exposeFrameworkSchemaMutations(framework, options)
	}

	reportPublicTransportProtection<
		const TTransport extends OperationTransportProtocol,
	>(options: PublicTransportProtectionOptions<TTransport>): void {
		const framework = readBoundFramework(this, false)
		requireAttributedOwner(framework)
		reportFrameworkPublicTransportProtection(framework, options)
	}
}

const createCoreApplicationRequestExecutor = (): Readonly<{
	dispose: () => void
	value: ApplicationRequestExecutor
}> => {
	const executor = new CoreApplicationRequestExecutor()
	const state: ApplicationRequestExecutorState = {
		disposed: false,
		framework: undefined,
	}
	applicationRequestExecutorStates.set(executor, state)
	Object.freeze(executor)

	return immutableRecord({
		value: executor,
		dispose: () => {
			state.disposed = true
			state.framework = undefined
		},
	})
}

/** Provides transports with one Core-owned application request entry point. */
export const applicationRequestExecutionCapability: CapabilityToken<
	ApplicationRequestExecutor,
	ApplicationRequestExecutor,
	'ultimabase.application-request-execution',
	'1.0.0',
	'single',
	'application'
> = defineCapability<ApplicationRequestExecutor>()({
	capabilityId: 'ultimabase.application-request-execution',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => {
		if (!applicationRequestExecutorStates.has(provider)) {
			throw new TypeError(
				'Application request execution must use the Core provider',
			)
		}
		return provider
	},
})

const canonicalApplicationRequestExecutor = provideCapability(
	applicationRequestExecutionCapability,
	{
		contributionId: 'application-request-executor',
		create: createCoreApplicationRequestExecutor,
	},
)

/** @internal Supplies the request facade only when a plugin consumes it. */
export const canonicalApplicationRequestExecutionFoundation: Readonly<{
	declaration: CapabilityProviderDeclaration<
		typeof applicationRequestExecutionCapability
	>
	owner: PluginIdentity
	version: string
}> = immutableRecord({
	declaration: canonicalApplicationRequestExecutor,
	owner: immutableRecord({ pluginId: '@ultimabase/core' }),
	version: '0.0.0',
})

/** @internal Completes the one-time binding after FrameworkEngine construction. */
export const bindApplicationRequestExecutor = (
	executor: ApplicationRequestExecutor | undefined,
	framework: FrameworkEngine,
): void => {
	if (executor === undefined) return
	const state = readExecutorState(executor)
	if (state.framework !== undefined) {
		throw new TypeError('Application request executor is already bound')
	}
	state.framework = framework
}

/** Identifies the non-replaceable Core request-entry protocol. */
export const isApplicationRequestExecutionCapability = (
	token: object,
): boolean => token === applicationRequestExecutionCapability
