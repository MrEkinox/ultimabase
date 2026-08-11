import {
	definePlugin,
	type PluginEnvironmentClaim,
	type PluginIdentity,
	type PluginManifest,
	type PluginPrivilege,
} from '../../src/index.js'

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

void plugin
void privilege
void environment
void (undefined as unknown as InspectedPrivilege)
void (undefined as unknown as InspectedEnvironment)
void (undefined as unknown as InspectedIdentity)
void (undefined as unknown as InspectedManifest)
