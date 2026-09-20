import type { OperationOptions } from '../../query/operations/options.js'
import { FrameworkError } from '../../errors/framework-error.js'
import { getCurrentApplication } from './active-framework-context.js'

type ApplicationFacade = NonNullable<OperationOptions['ultimabase']>

// A weak association selects the owning facade without a process-wide default.
const applicationFacades = new WeakMap<
	ApplicationFacade['application'],
	ApplicationFacade
>()

/** @internal Associates the canonical facade with its own application. */
export const registerApplicationFacade = (facade: ApplicationFacade): void => {
	applicationFacades.set(facade.application, facade)
}

/**
 * Returns the UltimaBase facade owning the active request.
 * Fails outside a request or when a low-level engine has no owning facade.
 *
 * @example `getCurrentUltimaBase().operation(operation).execute(input)`
 */
export const getCurrentUltimaBase = (): ApplicationFacade => {
	const facade = applicationFacades.get(getCurrentApplication())
	if (facade === undefined) {
		throw new FrameworkError(
			'MISSING_EXECUTION_CONTEXT',
			'The active application has no owning UltimaBase facade.',
			{ publicMessage: 'No application execution facade is available.' },
		)
	}
	return facade
}
