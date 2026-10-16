import { immutableRecord } from '@ultimabase/shared'

import type { SchemaDefinition } from '../schema/schema/definition.js'
import { isSamePluginIdentity, type PluginIdentity } from './manifest.js'

/**
 * Reads the values one plugin's schema options received on one compiled
 * schema: the `.with((plugins) => …)` rule entries and shape-method arguments whose
 * option the plugin declared (ADR-0316). Options of other plugins and of Core
 * are never returned, and an option the schema does not set is absent.
 *
 * @example
 * ```ts
 * provideRuntimeBehavior({
 *   contributionId: 'audit',
 *   create: ({ owner }) => ({
 *     value: {
 *       postCommit: ({ operation }) => {
 *         const schema = getOperationSchema(operation)
 *         if (readSchemaRules(schema, owner).audit === true) log(schema.className)
 *       },
 *     },
 *   }),
 * })
 * ```
 */
export const readSchemaRules = (
	schema: SchemaDefinition,
	owner: PluginIdentity,
): Readonly<Record<string, unknown>> =>
	immutableRecord(
		Object.fromEntries(
			Object.entries(schema.provenance.options)
				.filter(
					([name, provenance]) =>
						provenance.definition.owner.kind === 'plugin' &&
						isSamePluginIdentity(provenance.definition.owner, owner) &&
						Object.hasOwn(schema.definition, name),
				)
				.map(([name]): [string, unknown] => [
					name,
					Reflect.get(schema.definition, name),
				]),
		),
	)
