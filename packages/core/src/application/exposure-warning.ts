import { readSchemaExposeRule } from '../plugins/exposure-rules.js'
import type { SchemaDefinition } from '../schema/schema/definition.js'
import type { ApplicationLog } from './application-log.js'

// Applications in which at least one transport asked Core for an exposure plan.
const plannedApplications = new WeakSet<object>()

/** @internal Records that a transport asked for an exposure plan (ADR-0347). */
export const recordExposurePlanning = (application: object): void => {
	plannedApplications.add(application)
}

/**
 * @internal Warns once per schema declaring `expose` when no transport asked
 * for a plan by the end of start: the rule then has no effect (ADR-0347).
 */
export const warnUnusedExposeRules = (
	application: object,
	schemas: readonly SchemaDefinition[],
	log: ApplicationLog,
): void => {
	if (plannedApplications.has(application)) return
	for (const schema of schemas) {
		if (readSchemaExposeRule(schema) !== undefined) {
			log.warn(
				`${schema.className} declares expose, but no transport is installed: it has no effect.`,
			)
		}
	}
}
