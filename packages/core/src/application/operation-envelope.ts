import { immutableRecord } from '@ultimabase/shared'

import type {
	CompiledCommandGraph,
	CompiledOperationCommand,
} from '../plugins/command-graph.js'
import type { PluginOperationEnvelope } from './application-operation-contracts.js'

/** Direct handles and transports share one snapshot and envelope contract. */
export const prepareOperationEnvelope = (
	graph: CompiledCommandGraph,
	command: CompiledOperationCommand,
	input: unknown,
): PluginOperationEnvelope =>
	immutableRecord({
		kind: 'plugin-operation' as const,
		name: command.definition.name,
		payload: graph.snapshotOperation(command, 'input', input),
		target: immutableRecord({ kind: 'application' as const }),
		transaction: command.definition.transaction,
		version: command.definition.version,
	})
