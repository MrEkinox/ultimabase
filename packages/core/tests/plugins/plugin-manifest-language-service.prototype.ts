import {
	defineCapability,
	definePlugin,
	provideCapability,
	type CapabilityToken,
	type PluginEnvironmentClaim,
	type PluginIdentity,
	type PluginManifest,
	type PluginPrivilege,
} from '../../src/index.js'

const capability = defineCapability<{ readonly endpoint: string }>()({
	capabilityId: 'fixture.language-capability',
	version: '1.0.0',
	cardinality: /* completion:cardinality */ 'single',
	lifetime: /* completion:lifetime */ 'declaration',
})
const provider = provideCapability(capability, { endpoint: 'local' })
const providerValue = /* hover:provider-value */ provider.value

const plugin = definePlugin({
	pluginId: 'fixture.language-service',
	version: '1.0.0',
	core: '^0.0.0',
	privileges: [
		{
			name: 'runtime:observe',
			reason: 'Verifies privilege completion.',
		},
	],
	environment: ['environment:network'],
})

const privilege: PluginPrivilege = /* completion:privilege */ 'runtime:observe'
const environment: PluginEnvironmentClaim =
	/* completion:environment */ 'environment:network'
type InspectedPrivilege = /* hover:privilege */ PluginPrivilege
type InspectedEnvironment = /* hover:environment */ PluginEnvironmentClaim
type InspectedIdentity = /* hover:identity */ PluginIdentity
type InspectedManifest = /* hover:manifest */ PluginManifest
type InspectedCapability = /* hover:capability */ CapabilityToken

void plugin
void privilege
void environment
void provider
void providerValue
void (undefined as unknown as InspectedPrivilege)
void (undefined as unknown as InspectedEnvironment)
void (undefined as unknown as InspectedIdentity)
void (undefined as unknown as InspectedManifest)
void (undefined as unknown as InspectedCapability)
