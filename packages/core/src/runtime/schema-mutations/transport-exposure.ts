import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { assertExactEnumerableKeys } from '../../exact-object-validation.js'
import { projectSchemaMutationTransports } from '../commands/transport-projection.js'
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
	assertExactEnumerableKeys(
		options,
		exposureKeys,
		'schema mutation transport exposure contains unknown key: ',
	)
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
	for (const entry of projectSchemaMutationTransports(
		readApplicationKernelState(framework.application).commands,
		options.transport,
	)) {
		const schema = framework.application.schemas.get(entry.descriptor.schema)
		if (schema === undefined)
			throw new TypeError('Compiled command schema is unavailable')
		exposed.push(
			immutableRecord({
				...entry,
				commandName: entry.descriptor.command,
				schema,
			}),
		)
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
