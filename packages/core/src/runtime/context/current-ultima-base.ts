import type { OperationOptions } from '../../query/operations/options.js'
import type { PluginDefinition } from '../../plugins/definition.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { FrameworkApplication } from '../../application/framework-application.js'
import { getCurrentEngine } from './active-framework-context.js'

type ApplicationFacade = NonNullable<OperationOptions['ultimabase']>
type ApplicationKernel = FrameworkApplication<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
>

// A weak association selects the owning facade without a process-wide default.
const applicationFacades = new WeakMap<ApplicationKernel, ApplicationFacade>()

/** @internal Associates the canonical facade with its own application. */
export const registerApplicationFacade = (
	facade: ApplicationFacade,
	application: ApplicationKernel,
): void => {
	applicationFacades.set(application, facade)
}

/** @internal Resolves the sole public owner for a private application kernel. */
export const readApplicationFacade = (
	application: ApplicationKernel,
): ApplicationFacade => {
	const facade = applicationFacades.get(application)
	if (facade === undefined) {
		throw new TypeError('Application kernel has no owning UltimaBase facade')
	}
	return facade
}

/**
 * Returns the UltimaBase facade owning the active request.
 * Fails outside a request or when a low-level engine has no owning facade.
 *
 * @example `getCurrentUltimaBase().operation(operation).execute(input)`
 */
export const getCurrentUltimaBase = (): ApplicationFacade => {
	return getCurrentEngine().ultimabase
}
