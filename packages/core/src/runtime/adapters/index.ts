export {
	adapterConstraintCapability,
	adapterMigrationCapability,
	adapterPersistencePlanCapability,
	adapterPhysicalSchemaCapability,
	adapterSupport,
	adapterValueStorageCapability,
	provideAdapterCapability,
} from './capabilities.js'
export type {
	AdapterCapabilityFamily,
	AdapterCapabilityRequirement,
	AdapterCapabilitySupportBase,
	AdapterConstraintSupport,
	AdapterMigrationSupport,
	AdapterPersistencePlanSupport,
	AdapterPhysicalSchemaSupport,
	AdapterValueStorageSupport,
} from './capabilities.js'
export {
	defineAdapterContributionCapability,
	provideAdapterContribution,
} from './contributions.js'
export type {
	AdapterContributionCapabilityToken,
	AdapterContributionDefinition,
	AdapterContributionFamily,
	AdapterContributionSnapshot,
} from './contributions.js'
export { adapterUpgradeIntent, planAdapterMigrations } from './migration.js'
export type {
	AdapterMigrationPlan,
	AdapterUpgradeIntentPayload,
	AdapterUpgradeTarget,
	OrphanedAdapterContribution,
	PlannedAdapterUpgrade,
} from './migration.js'
export {
	defineAdapterRawCapability,
	provideAdapterRawCapability,
} from './raw-access.js'
export type {
	AdapterAccess,
	AdapterRawCapabilityToken,
	AdapterRawCapabilityValue,
	AdapterRawFacade,
	AdapterRawProvider,
	DefineAdapterRawCapabilityOptions,
	ProvideAdapterRawCapabilityOptions,
} from './raw-access.js'
