import { readMutationCommand } from '../../plugins/command-graph.js'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { FrameworkEngine } from '../engine/framework-engine.js'
import { assertApplicationRequestExecutionAvailable } from '../engine/application-binding.js'
import { isOperationTransportProtocol } from '../plugin-operations/capabilities.js'
import { reportFrameworkPublicTransportProtection } from '../plugin-operations/engine-integration.js'
import { getFrameworkSchemaMutationRuntime } from './engine-integration.js'
import {
	CoreApplicationSchemaMutationTransport,
	type ApplicationSchemaMutationTransport,
	type SchemaMutationTransportExposureOptions,
} from './transport.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'

const exposureKeys = new Set(['acknowledgeUnverifiedProtection', 'transport'])

/** Builds the complete exact schema-mutation allowlist for one protocol. */
export const exposeFrameworkSchemaMutations = <
	const TTransport extends OperationTransportProtocol,
>(
	framework: FrameworkEngine,
	options: SchemaMutationTransportExposureOptions<TTransport>,
): ApplicationSchemaMutationTransport<TTransport> => {
	if (
		!isPlainRecord(options) ||
		!isOperationTransportProtocol(options.transport)
	) {
		throw new TypeError(
			'schema mutation transport exposure requires a transport protocol',
		)
	}
	for (const key of Object.keys(options)) {
		if (!exposureKeys.has(key)) {
			throw new TypeError(
				`schema mutation transport exposure contains unknown key: ${key}`,
			)
		}
	}
	const acknowledgement: unknown = options.acknowledgeUnverifiedProtection
	if (acknowledgement !== undefined && acknowledgement !== true) {
		throw new TypeError(
			'schema mutation transport acknowledgeUnverifiedProtection must be true when provided',
		)
	}

	const runtime = getFrameworkSchemaMutationRuntime(framework)
	const exposed: ConstructorParameters<
		typeof CoreApplicationSchemaMutationTransport<TTransport>
	>[1][number][] = []
	for (const schema of framework.application.schemas.values()) {
		const surface = framework.application.getSchemaSurface(schema.className)
		if (surface?.schema !== schema) continue
		const commands = new Map([
			...surface.schemaMutations,
			...surface.modelMutations,
		])
		for (const [commandName, view] of [...commands].sort(([left], [right]) =>
			left.localeCompare(right),
		)) {
			const { command } = readMutationCommand(view)
			const binding = runtime.findTransportBinding(command, options.transport)
			if (binding === undefined) continue
			exposed.push(immutableRecord({ binding, command, commandName, schema }))
		}
	}
	reportFrameworkPublicTransportProtection(framework, options)

	return new CoreApplicationSchemaMutationTransport(
		options.transport,
		exposed,
		runtime,
		(context) => {
			assertApplicationRequestExecutionAvailable(framework.application)
			return framework.withContext(context)
		},
	)
}
