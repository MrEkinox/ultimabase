import process from 'node:process'

/** Deployment environment that official plugin defaults depend on (ADR-0312). */
export type DeploymentEnvironment = 'development' | 'production'

/**
 * Reads `NODE_ENV`: `production` means production; any other value, or none,
 * means development. Plugins call it in their factory, never per request, and
 * Core never reads it.
 *
 * @example `const environment = readDeploymentEnvironment()`
 */
export const readDeploymentEnvironment = (): DeploymentEnvironment =>
	process.env.NODE_ENV === 'production' ? 'production' : 'development'

/** One plugin default and where it comes from, for the plugin's `debug` line. */
export interface EnvironmentDefault<TValue> {
	readonly value: TValue
	/** `'option'` when configured explicitly, else the deployment environment. */
	readonly source: 'option' | DeploymentEnvironment
}

/** The development and production values of one environment-dependent default. */
export interface EnvironmentDefaults<TValue> {
	readonly development: TValue
	readonly production: TValue
}

/**
 * Resolves one option whose default depends on the deployment: an explicit
 * value always wins, else the default of the current environment.
 *
 * @example `deriveEnvironmentDefault(options.introspection, { development: true, production: false })`
 */
export const deriveEnvironmentDefault = <TValue>(
	explicit: TValue | undefined,
	defaults: EnvironmentDefaults<TValue>,
): EnvironmentDefault<TValue> => {
	if (explicit !== undefined) return { source: 'option', value: explicit }
	const environment = readDeploymentEnvironment()
	return { source: environment, value: defaults[environment] }
}

/**
 * Describes where a derived default comes from, for log lines.
 *
 * @example `logger.debug(\`introspection enabled (${describeEnvironmentSource(source)})\`)`
 */
export const describeEnvironmentSource = (
	source: EnvironmentDefault<unknown>['source'],
): string =>
	source === 'option'
		? 'explicit option'
		: source === 'production'
			? 'NODE_ENV is production'
			: 'NODE_ENV is not production'
