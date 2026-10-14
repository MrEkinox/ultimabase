import { satisfies } from 'semver'

import { FrameworkError } from '../errors/framework-error.js'
import { formatPluginIdentity, type PluginManifest } from './manifest.js'

/**
 * @internal The installed `@ultimabase/core` version (ADR-0338). A test keeps
 * it equal to `packages/core/package.json`; a release that bumps Core updates
 * both. A constant, unlike a read of `package.json`, works the same from
 * source, from the built bundle and in any runtime.
 */
export const coreVersion = '0.0.0'

/**
 * @internal Rejects a plugin whose Core range the installed Core does not
 * satisfy, with the same rule and message as a peer range (ADR-0338).
 */
export const assertCoreRangeSatisfied = (
	manifest: PluginManifest,
	installedVersion: string = coreVersion,
): void => {
	if (satisfies(installedVersion, manifest.core)) return

	throw new FrameworkError(
		'PLUGIN_PROTOCOL_INCOMPATIBLE',
		`Plugin "${formatPluginIdentity(manifest.identity)}" requires @ultimabase/core version "${manifest.core}", but version "${installedVersion}" is installed.`,
		{
			internalDetails: {
				kind: 'core-version',
				pluginId: manifest.identity.pluginId,
				requiredVersion: manifest.core,
				installedVersion,
			},
		},
	)
}
