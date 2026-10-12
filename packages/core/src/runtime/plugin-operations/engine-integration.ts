import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { runApplicationWork } from '../../application/active-application.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { prepareOperationEnvelope } from '../../application/operation-envelope.js'
import { FrameworkError } from '../../errors/framework-error.js'
import { assertExactEnumerableKeys } from '../../exact-object-validation.js'
import { runWithApplicationPluginOwner } from '../../plugins/callback-execution.js'
import type { CompiledOperationCommand } from '../../plugins/command-graph.js'
import { runtimeConstraintCapability } from '../capabilities.js'
import type { OperationTransportImplementation } from '../commands/bindings.js'
import { resolveCommandTransport } from '../commands/default-transports.js'
import { describeOperationTransport } from '../commands/transport-projection.js'
import { isRequestContext } from '../context/request-context.js'
import { getProtectedPolicyImplementation } from '../enforcement/protected-policy.js'
import { assertApplicationRequestExecutionAvailable } from '../engine/application-binding.js'
import type { FrameworkEngine } from '../engine/framework-engine.js'
import {
	getOperationWireCodec,
	isOperationTransportProtocol,
} from './capabilities.js'
import type { OperationTransportProtocol } from './contracts.js'
import {
	commandFailure,
	executeRequestPluginOperation,
} from './request-execution.js'
import type {
	ApplicationOperationTransport,
	OperationTransportExposureOptions,
	OperationTransportRequest,
} from './transport.js'

/** Validates one closed exposure option record. */
export const assertTransportExposureOptions = (
	options: unknown,
	keys: readonly string[],
	labels: Readonly<{ invalid: string; exposure: string }>,
): void => {
	if (
		!isPlainRecord(options) ||
		!isOperationTransportProtocol(options.transport)
	) {
		throw new TypeError(labels.invalid)
	}
	assertExactEnumerableKeys(
		options,
		new Set(['transport', ...keys]),
		`${labels.exposure} contains unknown key: `,
	)
}

/** Reports whether at least one protected policy contribution is installed. */
export const hasFrameworkProtectedPolicy = (
	framework: FrameworkEngine,
): boolean =>
	readApplicationKernelState(framework.application)
		.capabilityContributions(runtimeConstraintCapability)
		.some(({ value }) => getProtectedPolicyImplementation(value) !== undefined)

/** Runs one wire codec under its binding owner's plugin attribution. */
const runOwnedCodec = <TResult>(
	application: object,
	binding: OperationTransportImplementation,
	run: (
		codec: NonNullable<ReturnType<typeof getOperationWireCodec>>,
	) => TResult,
): TResult => {
	const codec = getOperationWireCodec(binding.binding.codec)
	if (codec === undefined) {
		throw new TypeError('Operation transport codec is unavailable')
	}
	return runWithApplicationPluginOwner(application, binding.owner, () =>
		run(codec),
	)
}

interface ExposedOperation {
	readonly binding: OperationTransportImplementation
	readonly compiled: CompiledOperationCommand
}

/** Builds one explicit operation allowlist from installed exact tokens. */
export const exposeFrameworkOperations = <
	const TTransport extends OperationTransportProtocol,
>(
	framework: FrameworkEngine,
	options: OperationTransportExposureOptions<TTransport>,
): ApplicationOperationTransport<TTransport> => {
	const untrusted: unknown = options
	if (
		!isPlainRecord(untrusted) ||
		!isUnknownArray(untrusted.operations) ||
		untrusted.operations.length === 0
	) {
		throw new TypeError(
			'operation transport exposure requires a protocol and non-empty operation list',
		)
	}
	assertTransportExposureOptions(options, ['operations'], {
		invalid:
			'operation transport exposure requires a protocol and non-empty operation list',
		exposure: 'operation transport exposure',
	})
	const { application } = framework
	const graph = readApplicationKernelState(application).commands
	const { transport } = options
	const exposed = new Map<string, ExposedOperation>()
	for (const tokenOrName of options.operations) {
		const name =
			typeof tokenOrName === 'string' ? tokenOrName : tokenOrName.name
		if (typeof name !== 'string') {
			throw new TypeError(
				'operation transport exposure entries must be tokens or names',
			)
		}
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
		const binding = resolveCommandTransport(graph, compiled, transport)
		if (binding?.kind !== 'operation') {
			throw commandFailure(
				compiled,
				'operation-transport-binding-missing',
				`Operation ${name} has no binding for ${transport.name}@${transport.version}.`,
			)
		}
		exposed.set(name, immutableRecord({ binding, compiled }))
	}
	return immutableRecord({
		operations: immutableArray(
			[...exposed.values()].map(({ binding, compiled }) =>
				describeOperationTransport(graph, compiled, binding),
			),
		),
		transport,
		execute: async (request: OperationTransportRequest): Promise<unknown> => {
			const untrustedRequest: unknown = request
			if (!isPlainRecord(untrustedRequest)) {
				throw new TypeError(
					'operation transport request must be a plain object',
				)
			}
			const context: unknown = request.context
			if (!isRequestContext(context)) {
				throw new TypeError(
					'operation transport request context must be a RequestContext',
				)
			}
			// Application lifecycle and context provenance must pass before codecs run.
			assertApplicationRequestExecutionAvailable(application)
			const engine = framework.withContext(context)
			return runApplicationWork(application, async () => {
				const { operation } = request
				const entry = exposed.get(operation)
				if (entry === undefined) {
					throw new FrameworkError(
						'PLUGIN_OPERATION_INVALID',
						`Operation ${operation} is not exposed through ${transport.name}.`,
						{ publicMessage: 'The requested operation is not available.' },
					)
				}
				const { version } = entry.compiled.definition
				if (request.version !== version) {
					throw new FrameworkError(
						'PLUGIN_PROTOCOL_INCOMPATIBLE',
						`Operation ${operation} version ${request.version} is incompatible with ${version}.`,
						{
							publicMessage:
								'The requested operation version is not available.',
						},
					)
				}
				const decoded = runOwnedCodec(application, entry.binding, (codec) =>
					codec.decode(request.input),
				)
				const result = await executeRequestPluginOperation(
					engine,
					entry.compiled,
					prepareOperationEnvelope(graph, entry.compiled, decoded),
				)
				return runOwnedCodec(application, entry.binding, (codec) =>
					codec.encode(result),
				)
			})
		},
	})
}
