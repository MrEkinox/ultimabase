import { readApplicationCommandGraph } from '../../plugins/application-command-graph.js'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { PluginOperationEnvelope } from '../../application/application-handles.js'
import { FrameworkError } from '../../errors/framework-error.js'
import { readApplicationCapabilityContributions } from '../../plugins/application-capability-access.js'
import type { CompiledOperationCommand } from '../../plugins/command-graph.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import { runtimeConstraintCapability } from '../capabilities.js'
import { runWithRequestEngineScope } from '../context/active-framework-storage.js'
import { getProtectedPolicyImplementation } from '../enforcement/protected-policy.js'
import { assertApplicationRequestExecutionAvailable } from '../engine/application-binding.js'
import type {
	FrameworkEngine,
	RequestEngine,
} from '../engine/framework-engine.js'
import type { TransactionLifetime } from '../transactions/transaction-lifetime.js'
import { isOperationTransportProtocol } from './capabilities.js'
import type { OperationTransportProtocol } from './contracts.js'
import { PluginOperationRuntime } from './runtime.js'
import {
	CoreApplicationOperationTransport,
	type ApplicationOperationTransport,
	type OperationTransportExposureOptions,
	type PublicTransportProtectionOptions,
	type PublicTransportProtectionWarning,
} from './transport.js'

const frameworkPluginOperations = new WeakMap<
	FrameworkEngine,
	PluginOperationRuntime
>()
const warnedUnverifiedProtectionTransports = new WeakMap<
	FrameworkEngine,
	WeakSet<OperationTransportProtocol>
>()

const operationTransportExposureKeys: ReadonlySet<string> = new Set([
	'acknowledgeUnverifiedProtection',
	'operations',
	'transport',
])
const publicTransportProtectionKeys: ReadonlySet<string> = new Set([
	'acknowledgeUnverifiedProtection',
	'transport',
])

const protectedPolicyProviderPresence = (
	framework: FrameworkEngine,
): 'none' | 'present' =>
	readApplicationCapabilityContributions(
		framework.application,
		runtimeConstraintCapability,
	).some(
		(contribution) =>
			getProtectedPolicyImplementation(contribution.value) !== undefined,
	)
		? 'present'
		: 'none'

const warnUnverifiedPublicTransportProtection = (
	framework: FrameworkEngine,
	transport: OperationTransportProtocol,
): void => {
	let warned = warnedUnverifiedProtectionTransports.get(framework)
	if (warned === undefined) {
		warned = new WeakSet()
		warnedUnverifiedProtectionTransports.set(framework, warned)
	}
	if (warned.has(transport)) return
	warned.add(transport)

	const providerPresence = protectedPolicyProviderPresence(framework)
	const warning: PublicTransportProtectionWarning = immutableRecord({
		code: 'UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION' as const,
		message:
			providerPresence === 'none'
				? 'Public transport protection is unverified because no protected policy contribution is installed.'
				: 'Public transport protection is unverified because protected policy presence does not prove coverage of exposed operations.',
		policy: immutableRecord({
			coverage: 'unverified' as const,
			providerPresence,
		}),
		transport: immutableRecord({
			name: transport.name,
			version: transport.version,
		}),
	})

	console.warn('[UltimaBase] Unverified public transport protection', warning)
}

/** Reports Core's exact policy knowledge without claiming complete coverage. */
export const reportFrameworkPublicTransportProtection = <
	const TTransport extends OperationTransportProtocol,
>(
	framework: FrameworkEngine,
	options: PublicTransportProtectionOptions<TTransport>,
): void => {
	if (
		!isPlainRecord(options) ||
		!isOperationTransportProtocol(options.transport)
	) {
		throw new TypeError(
			'public transport protection requires a transport protocol',
		)
	}
	for (const key of Object.keys(options)) {
		if (!publicTransportProtectionKeys.has(key)) {
			throw new TypeError(
				`public transport protection contains unknown key: ${key}`,
			)
		}
	}
	const acknowledgment: unknown = options.acknowledgeUnverifiedProtection
	if (acknowledgment !== undefined && acknowledgment !== true) {
		throw new TypeError(
			'public transport acknowledgeUnverifiedProtection must be true when provided',
		)
	}
	if (acknowledgment !== true) {
		warnUnverifiedPublicTransportProtection(framework, options.transport)
	}
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
	const acknowledgeUnverifiedProtection: unknown =
		options.acknowledgeUnverifiedProtection
	if (
		acknowledgeUnverifiedProtection !== undefined &&
		acknowledgeUnverifiedProtection !== true
	) {
		throw new TypeError(
			'operation transport acknowledgeUnverifiedProtection must be true when provided',
		)
	}
	const exposed = new Map<
		string,
		{
			readonly binding: ReturnType<PluginOperationRuntime['transportBinding']>
			readonly compiled: CompiledOperationCommand
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
		const graph = readApplicationCommandGraph(framework.application)
		const compiled =
			typeof tokenOrName === 'string'
				? graph.get(name)
				: graph.fromSource(tokenOrName)
		if (compiled?.kind !== 'operation') {
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
	reportFrameworkPublicTransportProtection(framework, {
		...(acknowledgeUnverifiedProtection === true
			? { acknowledgeUnverifiedProtection }
			: {}),
		transport: options.transport,
	})

	return new CoreApplicationOperationTransport(
		options.transport,
		new Map(exposed),
		runtime,
		(context) => {
			assertApplicationRequestExecutionAvailable(framework.application)
			return framework.withContext(context)
		},
	)
}

interface ExecutePluginOperationRequest {
	readonly compiled: CompiledOperationCommand
	readonly engine: RequestEngine
	readonly envelope: PluginOperationEnvelope
	readonly transactionLifetime?: TransactionLifetime
	readonly runRequiredTransaction: () => Promise<unknown>
}

/** Enforces cancellation and transaction policy around one plugin handler. */
export const executePluginOperationRequest = async (
	request: ExecutePluginOperationRequest,
): Promise<unknown> => {
	const { compiled, engine, envelope, transactionLifetime } = request
	const targetKind: unknown = envelope.target.kind
	if (
		readApplicationCommandGraph(engine.application).get(
			compiled.definition.name,
		) !== compiled ||
		envelope.name !== compiled.definition.name ||
		envelope.version !== compiled.definition.version ||
		envelope.transaction !== compiled.definition.transaction ||
		targetKind !== 'application'
	) {
		throw new FrameworkError(
			'PLUGIN_OPERATION_INVALID',
			'Plugin operation envelope does not match the installed declaration.',
			{
				publicMessage: 'The requested operation is not available.',
				internalDetails: {
					kind: 'operation-envelope-mismatch',
					operation: compiled.definition.name,
				},
			},
		)
	}
	throwIfOperationCancelled(engine.context.signal, {
		phase: 'plugin-operation',
	})

	if (
		compiled.definition.transaction === 'required' &&
		transactionLifetime === undefined
	) {
		return request.runRequiredTransaction()
	}
	if (
		compiled.definition.transaction === 'forbidden' &&
		transactionLifetime !== undefined
	) {
		const error = new FrameworkError(
			'TRANSACTION_ERROR',
			`Operation ${compiled.definition.name} forbids an active transaction.`,
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
