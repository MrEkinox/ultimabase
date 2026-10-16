import * as pluginKit from '../src/index.js'
import { describe, expect, it } from 'vitest'

describe('@ultimabase/plugin-kit public API', () => {
	it('exports only focused authoring helpers', () => {
		expect(Object.keys(pluginKit).sort()).toStrictEqual([
			'SchemaPatchBuilder',
			'command',
			'createPluginEventDispatcher',
			'defineOperation',
			'defineOutputDescriptor',
			'definePlugin',
			'definePluginEvent',
			'definePluginEventCapability',
			'definePluginFieldOption',
			'definePluginOptionsParser',
			'deriveEnvironmentDefault',
			'describeEnvironmentSource',
			// ADR-0339: `feature` is the new name of `shapeMethod`.
			'feature',
			'observePluginEvent',
			'optionalPluginEvents',
			'patchSchemas',
			'providePluginEvent',
			'readDeploymentEnvironment',
			'readStandardJsonSchema',
			'requestRoleResolverCapability',
			'requireCurrentRequestRoleResolver',
			'resolveRequestRoleReference',
			'schemaPatch',
			'shapeMethod',
		])
	})
})
