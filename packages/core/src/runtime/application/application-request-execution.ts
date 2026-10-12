import type {
	AnonymousRequestAccess,
	MasterRequestAccess,
} from '../../access/index.js'
import { assertApplicationExecution } from '../../application/active-application.js'
import { FrameworkError } from '../../errors/framework-error.js'
import { assertExactEnumerablePlainObject } from '../../exact-object-validation.js'
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
	type CoreFoundationProvider,
	defineCoreFoundationProvider,
	provideCapability,
} from '../../plugins/capability-providers.js'
import { readApplicationPluginOwner } from '../../plugins/callback-execution.js'
import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import { runWithRequestEngine } from '../context/active-framework-context.js'
import type {
	RequestContext,
	RequestContextOptions,
} from '../context/request-context.js'
import {
	assertApplicationRequestExecutionAvailable,
	assertMasterElevationPrivilege,
} from '../engine/application-binding.js'
import type { FrameworkEngine } from '../engine/framework-engine.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'
import { reportFrameworkPublicTransportProtection } from '../plugin-operations/engine-integration.js'
import type {
	ApplicationOperationTransport,
	OperationTransportExposureOptions,
	PublicTransportProtectionOptions,
} from '../plugin-operations/transport.js'
import {
	readApplicationHealth,
	type ApplicationHealthStatus,
} from './application-health.js'
import {
	executeApplicationSchemaMutation,
	type ApplicationSchemaMutationRequest,
	type ApplicationSchemaMutationResult,
} from './application-schema-mutation-execution.js'
import {
	exposeFrameworkSchemaMutations,
	type ApplicationSchemaMutationTransport,
	type SchemaMutationTransportExposureOptions,
} from '../schema-mutations/transport.js'

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
	/**
	 * Reports the application's health exactly as `ultimabase.health()`:
	 * `DEGRADED` before binding, after disposal, or when the database fails.
	 */
	health(): Promise<ApplicationHealthStatus>
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

/** Resolves the bound framework for one attributed plugin callback. */
const enterBoundFramework = (
	executor: ApplicationRequestExecutor,
	requireStarted: boolean,
): FrameworkEngine => {
	const { framework } = readExecutorState(executor)
	if (framework === undefined) {
		throw new TypeError('Application request executor is not bound')
	}
	if (requireStarted) {
		assertApplicationRequestExecutionAvailable(framework.application)
	} else {
		assertApplicationExecution(framework.application)
	}
	if (readApplicationPluginOwner(framework.application) === undefined) {
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
	return framework
}

const assertMasterVerificationOptions: (
	options: unknown,
) => asserts options is ApplicationMasterKeyVerificationOptions = (options) => {
	assertExactEnumerablePlainObject(
		options,
		masterVerificationOptionKeys,
		'Master key verification options must be a plain object',
		'Master key verification contains unknown option: ',
	)
	assertNonEmptyString(options.rawKey, 'Master key')
	assertNonEmptyString(options.reason, 'Master key verification reason')
}

class CoreApplicationRequestExecutor implements ApplicationRequestExecutor {
	createAnonymousContext<const TSource extends string>(
		options: RequestContextOptions<TSource>,
	): RequestContext<AnonymousRequestAccess, TSource> {
		const framework = enterBoundFramework(this, true)
		return framework.anonymous(options).context
	}

	runWithContext<TContext extends RequestContext, TResult>(
		context: TContext,
		callback: (context: TContext) => TResult,
	): TResult {
		const framework = enterBoundFramework(this, true)
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
		const framework = enterBoundFramework(this, true)
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
		const framework = enterBoundFramework(this, true)
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
		const framework = enterBoundFramework(this, true)
		assertMasterElevationPrivilege(framework.application)
		const request = framework.withContext(options.context)
		const grant = framework.authorizeMasterKey(options.rawKey)
		const master = await request.useMasterKey(grant, options.reason)
		return master.context
	}

	exposeOperations<const TTransport extends OperationTransportProtocol>(
		options: OperationTransportExposureOptions<TTransport>,
	): ApplicationOperationTransport<TTransport> {
		const framework = enterBoundFramework(this, false)
		return framework.exposeOperations(options)
	}

	exposeSchemaMutations<const TTransport extends OperationTransportProtocol>(
		options: SchemaMutationTransportExposureOptions<TTransport>,
	): ApplicationSchemaMutationTransport<TTransport> {
		const framework = enterBoundFramework(this, false)
		return exposeFrameworkSchemaMutations(framework, options)
	}

	reportPublicTransportProtection<
		const TTransport extends OperationTransportProtocol,
	>(options: PublicTransportProtectionOptions<TTransport>): void {
		const framework = enterBoundFramework(this, false)
		reportFrameworkPublicTransportProtection(framework, options)
	}

	health(): Promise<ApplicationHealthStatus> {
		// Health never throws: an unbound or disposed executor is not healthy.
		const state = applicationRequestExecutorStates.get(this)
		return state === undefined ||
			state.disposed ||
			state.framework === undefined
			? Promise.resolve('DEGRADED')
			: readApplicationHealth(state.framework.application)
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
export const canonicalApplicationRequestExecutionFoundation: CoreFoundationProvider<
	typeof applicationRequestExecutionCapability
> = defineCoreFoundationProvider(canonicalApplicationRequestExecutor)

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
