import type { PluginDefinition } from '../../plugins/definition.js'
import type { PluginSourceState } from '../../plugins/source-projections.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { UltimaBase } from '../application/ultima-base.js'
import { readActiveApplicationOwner } from '../../application/active-application.js'
import { FrameworkError } from '../../foundation.js'
import { getActiveRequestEngine } from './active-framework-context.js'

type ApplicationFacade = UltimaBase<
	readonly SchemaDefinition[],
	readonly PluginDefinition[],
	PluginSourceState
>

// A weak association selects the owning facade without a process-wide default.
const applicationFacades = new WeakMap<object, ApplicationFacade>()

/** @internal Associates the canonical facade with its own application. */
export const registerApplicationFacade = (
	facade: ApplicationFacade,
	application: object,
): void => {
	applicationFacades.set(application, facade)
}

/** @internal Resolves the sole public owner for a private application kernel. */
export const readApplicationFacade = (
	application: object,
): ApplicationFacade => {
	const facade = applicationFacades.get(application)
	if (facade === undefined) {
		throw new TypeError('Application kernel has no owning UltimaBase facade')
	}
	return facade
}

/**
 * Returns the facade owning the active request or sole initialized application.
 * Fails when neither boundary provides one or a low-level owner has no facade.
 *
 * @example `getCurrentUltimaBase().operation(operation).execute(input)`
 */
export const getCurrentUltimaBase = (): ApplicationFacade => {
	const engine = getActiveRequestEngine()
	if (engine !== undefined) return engine.ultimabase

	const application = readActiveApplicationOwner()
	if (application !== undefined) return readApplicationFacade(application)

	throw new FrameworkError(
		'MISSING_EXECUTION_CONTEXT',
		'No initialized active UltimaBase application is available.',
		{ publicMessage: 'No application execution context is available.' },
	)
}
