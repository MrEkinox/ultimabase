import * as pluginKit from '../src/index.js'
import { describe, expect, it } from 'vitest'

describe('@ultimabase/plugin-kit public API', () => {
	it('exports only focused authoring helpers', () => {
		expect(Object.keys(pluginKit).sort()).toStrictEqual([
			'SchemaPatchBuilder',
			// ADR-0347: the shared publicWrites check of transports.
			'assertPublicWrites',
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
			// ADR-0339: `feature` declares one `define` key.
			'feature',
			'observePluginEvent',
			'optionalPluginEvents',
			// ADR-0347 decision 3: the shared transport exposure options.
			'parseTransportExposureOptions',
			'patchSchemas',
			'providePluginEvent',
			'readDeploymentEnvironment',
			// ADR-0347: the typed reader of a transport's exposure plan.
			'readExposurePlan',
			'readStandardJsonSchema',
			'requestRoleResolverCapability',
			'requireCurrentRequestRoleResolver',
			'resolveRequestRoleReference',
			'schemaPatch',
			'transportExposureOptionKeys',
		])
	})
})
