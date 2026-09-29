import type { OperationOptions } from '../../query/operations/options.js'
import type { PluginDefinition } from '../../plugins/definition.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { FrameworkApplication } from '../../application/framework-application.js'
import { readActiveApplicationOwner } from '../../application/active-application.js'
import { FrameworkError } from '../../foundation.js'
import { getActiveFrameworkContext } from './active-framework-storage.js'

type ApplicationFacade = NonNullable<OperationOptions['ultimabase']>
type ApplicationKernel = FrameworkApplication<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
>

// A weak association selects the owning facade without a process-wide default.
const applicationFacades = new WeakMap<object, ApplicationFacade>()

/** @internal Associates the canonical facade with its own application. */
export const registerApplicationFacade = (
	facade: ApplicationFacade,
	application: ApplicationKernel,
): void => {
	applicationFacades.set(application, facade)
}

/** @internal Resolves the sole public owner for a private application kernel. */
export const readApplicationFacade = (
	application: ApplicationKernel | object,
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
	const request = getActiveFrameworkContext()
	if (request !== undefined) return request.ultimabase

	const application = readActiveApplicationOwner()
	if (application !== undefined) return readApplicationFacade(application)

	throw new FrameworkError(
		'MISSING_EXECUTION_CONTEXT',
		'No initialized active UltimaBase application is available.',
		{ publicMessage: 'No application execution context is available.' },
	)
}
