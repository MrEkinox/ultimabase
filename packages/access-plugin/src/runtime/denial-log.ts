import { FrameworkError, type Logger } from '@ultimabase/core'
import type { DeploymentEnvironment } from '@ultimabase/plugin-kit'
import { isPlainRecord } from '@ultimabase/shared'

const steps: Readonly<Record<string, string>> = {
	'access-field-read': 'field',
	'access-field-write': 'field',
	'access-filter': 'row filter',
	'access-item': 'item',
	'access-operation': 'operation',
}

// The read policy operations print as the methods rules name (ADR-0347).
const printedOperations: ReadonlyMap<string, string> = new Map([
	['many', 'findMany'],
	['one', 'findOne'],
])

/**
 * Logs why Access denied one request (ADR-0317, decision 5): the schema, the
 * operation, the step and the rule, at `info` outside production and `debug`
 * in production. The client still receives the same `PERMISSION_DENIED`.
 */
export const createDenialLog =
	(logger: Logger, environment: DeploymentEnvironment) =>
	(error: unknown, operation: string): void => {
		if (!(error instanceof FrameworkError)) return
		const details: unknown = error.internalDetails
		if (
			!isPlainRecord(details) ||
			details.kind !== 'access-rule-denied' ||
			typeof details.schema !== 'string' ||
			typeof details.rule !== 'string' ||
			typeof details.phase !== 'string'
		) {
			return
		}
		const line = `denied ${printedOperations.get(operation) ?? operation} on ${details.schema} at the ${steps[details.phase] ?? details.phase} step (${details.rule}).`
		if (environment === 'production') logger.debug(line)
		else logger.info(line)
	}
