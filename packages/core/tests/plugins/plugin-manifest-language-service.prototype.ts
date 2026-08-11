import {
	decorateCapability,
	defineCapability,
	definePlugin,
	FrameworkApplication,
	provideCapability,
	replaceCapability,
	type CapabilityToken,
	type CapabilityProviderChainInspection,
	type PluginEnvironmentClaim,
	type PluginDeclarationContext,
	type PluginIdentity,
	type PluginManifest,
	type PluginPrivilege,
	type PluginPrivilegePolicy,
	type PluginPrivilegeReport,
} from '../../src/index.js'

const capability = defineCapability<{ readonly endpoint: string }>()({
	capabilityId: 'fixture.language-capability',
	version: '1.0.0',
	cardinality: /* completion:cardinality */ 'single',
	lifetime: /* completion:lifetime */ 'declaration',
	compose: ([provider]) => provider,
})
const provider = provideCapability(capability, {
	contributionId: 'local',
	value: { endpoint: 'local' },
})
const providerValue = /* hover:provider-value */ provider.value
const decorator = /* hover:decorator */ decorateCapability(capability, {
	contributionId: 'documented',
	decorate: (consumer) => consumer,
})
const replacement = /* hover:replacement */ replaceCapability(capability, {
	contributionId: 'replacement',
	target: {
		owner: { pluginId: 'fixture.language-provider' },
		contributionId: 'local',
	},
	value: { endpoint: 'replacement' },
})
const policyPlugin = definePlugin({
	pluginId: 'fixture.policy-language-service',
	instanceId: 'editorial',
	version: '1.0.0',
	core: '^0.0.0',
})

const policyApplication = new FrameworkApplication({
	schemas: [],
	plugins: [policyPlugin],
	pluginPrivileges: {
		deny: [/* completion:policy-privilege */ 'runtime:observe'],
		denyClaims: [/* completion:policy-claim */ 'environment:network'],
		plugins: {/* completion:policy-plugin */},
		logger: false,
	},
})

const policyInstanceApplication = new FrameworkApplication({
	schemas: [],
	plugins: [policyPlugin],
	pluginPrivileges: {
		plugins: {
			'fixture.policy-language-service': {
				instances: {/* completion:policy-instance */},
			},
		},
		logger: false,
	},
})

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
type InspectedCapabilityChain =
	/* hover:capability-chain */ CapabilityProviderChainInspection
type InspectedPolicy = /* hover:policy */ PluginPrivilegePolicy
type InspectedReport = /* hover:report */ PluginPrivilegeReport
type InspectedDeclarationContext =
	/* hover:declaration-context */ PluginDeclarationContext

void plugin
void privilege
void environment
void provider
void providerValue
void decorator
void replacement
void policyApplication
void policyInstanceApplication
void (undefined as unknown as InspectedPrivilege)
void (undefined as unknown as InspectedEnvironment)
void (undefined as unknown as InspectedIdentity)
void (undefined as unknown as InspectedManifest)
void (undefined as unknown as InspectedCapability)
void (undefined as unknown as InspectedCapabilityChain)
void (undefined as unknown as InspectedPolicy)
void (undefined as unknown as InspectedReport)
void (undefined as unknown as InspectedDeclarationContext)
