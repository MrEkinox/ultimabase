import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	ApplicationOperationBinding,
	PluginOperationEnvelope,
} from '../../application/application-handles.js'
import { FrameworkError } from '../../errors/framework-error.js'
import type { CompiledPluginOperation } from '../../plugins/application-surface-registry.js'
import { readApplicationCapabilityContributions } from '../../plugins/application-capability-access.js'
import { runtimeConstraintCapability } from '../capabilities.js'
import { getProtectedPolicyImplementation } from '../enforcement/protected-policy.js'
import { runWithRequestEngineScope } from '../context/active-framework-storage.js'
import type {
	FrameworkEngine,
	RequestEngine,
} from '../engine/framework-engine.js'
import { throwIfOperationCancelled } from '../hooks/cancellation.js'
import type { TransactionLifetime } from '../transactions/transaction-lifetime.js'
import { isOperationTransportProtocol } from './capabilities.js'
import type { OperationTransportProtocol } from './contracts.js'
import { PluginOperationRuntime } from './runtime.js'
import {
	CoreApplicationOperationTransport,
	type ApplicationOperationTransport,
	type OperationTransportExposureOptions,
	type UnprotectedPublicTransportWarning,
} from './transport.js'

const frameworkPluginOperations = new WeakMap<
	FrameworkEngine,
	PluginOperationRuntime
>()
const warnedUnprotectedTransports = new WeakMap<
	FrameworkEngine,
	WeakSet<OperationTransportProtocol>
>()

const operationTransportExposureKeys: ReadonlySet<string> = new Set([
	'acknowledgeUnprotected',
	'operations',
	'transport',
])

const hasProtectedPolicy = (framework: FrameworkEngine): boolean =>
	readApplicationCapabilityContributions(
		framework.application,
		runtimeConstraintCapability,
	).some(
		(contribution) =>
			getProtectedPolicyImplementation(contribution.value) !== undefined,
	)

const warnUnprotectedPublicTransport = (
	framework: FrameworkEngine,
	transport: OperationTransportProtocol,
): void => {
	let warned = warnedUnprotectedTransports.get(framework)
	if (warned === undefined) {
		warned = new WeakSet()
		warnedUnprotectedTransports.set(framework, warned)
	}
	if (warned.has(transport)) return
	warned.add(transport)

	const warning: UnprotectedPublicTransportWarning = immutableRecord({
		code: 'UNPROTECTED_PUBLIC_TRANSPORT' as const,
		message:
			'Public transport started without a protected policy contribution.',
		transport: immutableRecord({
			name: transport.name,
			version: transport.version,
		}),
	})

	console.warn('[UltimaBase] Unprotected public transport', warning)
}

/** Materializes operation capabilities only when an initialized facade uses them. */
export const getFrameworkPluginOperations = (
	framework: FrameworkEngine,
): PluginOperationRuntime => {
	let runtime = frameworkPluginOperations.get(framework)
	if (runtime === undefined) {
		runtime = new PluginOperationRuntime(framework.application)
		frameworkPluginOperations.set(framework, runtime)
	}
	return runtime
}

/** Builds one explicit operation allowlist from installed exact tokens. */
export const exposeFrameworkOperations = <
	const TTransport extends OperationTransportProtocol,
>(
	framework: FrameworkEngine,
	options: OperationTransportExposureOptions<TTransport>,
): ApplicationOperationTransport<TTransport> => {
	if (
		!isPlainRecord(options) ||
		!isOperationTransportProtocol(options.transport) ||
		!isUnknownArray(options.operations) ||
		options.operations.length === 0
	) {
		throw new TypeError(
			'operation transport exposure requires a protocol and non-empty operation list',
		)
	}
	for (const key of Object.keys(options)) {
		if (!operationTransportExposureKeys.has(key)) {
			throw new TypeError(
				`operation transport exposure contains unknown key: ${key}`,
			)
		}
	}
	const acknowledgeUnprotected: unknown = options.acknowledgeUnprotected
	if (acknowledgeUnprotected !== undefined && acknowledgeUnprotected !== true) {
		throw new TypeError(
			'operation transport acknowledgeUnprotected must be true when provided',
		)
	}
	const exposed = new Map<
		string,
		{
			readonly binding: ReturnType<PluginOperationRuntime['transportBinding']>
			readonly compiled: CompiledPluginOperation
		}
	>()
	const runtime = getFrameworkPluginOperations(framework)
	for (const tokenOrName of options.operations) {
		const name =
			typeof tokenOrName === 'string' ? tokenOrName : tokenOrName.name
		if (typeof name !== 'string') {
			throw new TypeError(
				'operation transport exposure entries must be tokens or names',
			)
		}
		const compiled = framework.application.getOperation(name)
		if (
			compiled === undefined ||
			(typeof tokenOrName !== 'string' && compiled.operation !== tokenOrName)
		) {
			throw new FrameworkError(
				'PLUGIN_OPERATION_INVALID',
				`Operation ${name} is not installed in this application.`,
				{ publicMessage: 'The requested operation is not available.' },
			)
		}
		if (exposed.has(name)) {
			throw new TypeError(`operation transport exposure repeats ${name}`)
		}
		exposed.set(
			name,
			immutableRecord({
				binding: runtime.transportBinding(compiled, options.transport),
				compiled,
			}),
		)
	}
	if (acknowledgeUnprotected !== true && !hasProtectedPolicy(framework)) {
		warnUnprotectedPublicTransport(framework, options.transport)
	}

	return new CoreApplicationOperationTransport(
		options.transport,
		new Map(exposed),
		runtime,
		(context) => framework.withContext(context),
	)
}

interface ExecutePluginOperationRequest {
	readonly binding: ApplicationOperationBinding
	readonly compiled: CompiledPluginOperation
	readonly engine: RequestEngine
	readonly envelope: PluginOperationEnvelope
	readonly transactionLifetime?: TransactionLifetime
	readonly runRequiredTransaction: () => Promise<unknown>
}

/** Enforces cancellation and transaction policy around one plugin handler. */
export const executePluginOperationRequest = async (
	request: ExecutePluginOperationRequest,
): Promise<unknown> => {
	const { binding, compiled, engine, envelope, transactionLifetime } = request
	if (
		engine.application.getOperation(compiled.operation.name) !== compiled ||
		envelope.name !== compiled.operation.name ||
		envelope.version !== compiled.operation.version ||
		envelope.transaction !== compiled.operation.transaction
	) {
		throw new FrameworkError(
			'PLUGIN_OPERATION_INVALID',
			'Plugin operation envelope does not match the installed declaration.',
			{
				publicMessage: 'The requested operation is not available.',
				internalDetails: {
					kind: 'operation-envelope-mismatch',
					operation: compiled.operation.name,
				},
			},
		)
	}
	throwIfOperationCancelled(engine.context.signal, {
		phase: 'plugin-operation',
	})

	if (
		compiled.operation.transaction === 'required' &&
		transactionLifetime === undefined
	) {
		return request.runRequiredTransaction()
	}
	if (
		compiled.operation.transaction === 'forbidden' &&
		transactionLifetime !== undefined
	) {
		const error = new FrameworkError(
			'TRANSACTION_ERROR',
			`Operation ${compiled.operation.name} forbids an active transaction.`,
			{
				publicMessage: 'The operation cannot run in this transaction.',
				internalDetails: {
					reason: 'plugin-operation-transaction-forbidden',
				},
			},
		)
		transactionLifetime.markFailed(error)
		throw error
	}

	const execute = () =>
		runWithRequestEngineScope(engine, () =>
			getFrameworkPluginOperations(engine.framework).execute(
				engine,
				compiled,
				binding,
				envelope,
			),
		)
	const result = await (transactionLifetime === undefined
		? execute()
		: transactionLifetime.run(execute))
	throwIfOperationCancelled(engine.context.signal, {
		phase: 'plugin-operation-result',
	})
	return result
}
