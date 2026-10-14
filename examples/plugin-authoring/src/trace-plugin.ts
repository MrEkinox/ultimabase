//#region trace-plugin
import { contributeApplication, plugin } from '@ultimabase/core/plugin'
import {
	deriveEnvironmentDefault,
	describeEnvironmentSource,
} from '@ultimabase/plugin-kit'

/** Verbose in development, quiet in production, unless an option decides. */
export const tracePlugin = (options: { verbose?: boolean } = {}) => {
	// Read once in the factory, never per request.
	const verbose = deriveEnvironmentDefault(options.verbose, {
		development: true,
		production: false,
	})
	return plugin({
		id: 'community.trace',
		core: '^0.0.0',
		version: '1.0.0',
		contributions: [
			contributeApplication(({ logger }) => {
				logger.debug(
					`verbose ${String(verbose.value)} (${describeEnvironmentSource(verbose.source)})`,
				)
				return { exports: { verbose: verbose.value } }
			}),
		],
	})
}
//#endregion trace-plugin
