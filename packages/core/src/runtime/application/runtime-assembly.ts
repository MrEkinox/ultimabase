import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import type { FrameworkApplication } from '../../application/framework-application.js'
import type { PluginDefinition } from '../../plugins/definition.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { databaseAdapterCapability } from '../database/contracts.js'
import type { FrameworkEngine } from '../engine/framework-engine.js'
import {
	createFrameworkEngine,
	type CreateFrameworkEngineOptions,
} from './create-framework-engine.js'

/** Names the capability an application without a database lacks. */
export const missingDatabaseCapability = (): string =>
	`no plugin provides the database capability ${databaseAdapterCapability.capabilityId}`

const listedSchemas = 3

/**
 * Assembles Runtime when a database plugin is installed. Without one, an
 * application with schemas cannot start (ADR-0340), while a lifecycle-only
 * application without schemas starts with no Runtime.
 */
export const assembleRuntime = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	application: FrameworkApplication<TSchemas, TPlugins>,
	options: Readonly<CreateFrameworkEngineOptions>,
): FrameworkEngine<TSchemas, TPlugins> | undefined => {
	if (
		readApplicationKernelState(application).capabilityContributions(
			databaseAdapterCapability,
		).length > 0
	) {
		return createFrameworkEngine(application, options)
	}
	const schemas = application.schemas.values()
	if (schemas.length === 0) return undefined
	const names = schemas
		.slice(0, listedSchemas)
		.map(({ className }) => className)
		.join(', ')
	const more = schemas.length > listedSchemas ? ', …' : ''
	const registered =
		schemas.length === 1
			? '1 schema is registered'
			: `${String(schemas.length)} schemas are registered`
	throw new TypeError(
		`UltimaBase cannot start: ${registered} (${names}${more}) but ${missingDatabaseCapability()}. Install a database plugin with UltimaBase.use(...).`,
	)
}
