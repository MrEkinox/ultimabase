import type {
	CompiledApplication,
	SchemaCompilationProvenance,
	SchemaContributionProvenance,
	SchemaDefinition,
	UltimaBase,
} from '@ultimabase/core'
import type { PluginDefinition } from '@ultimabase/core/plugin'
type PublicOwner = Readonly<{
	readonly instanceId?: string
	readonly pluginId: string
	readonly version?: string
}>

// The snapshot is only compared through `JSON.stringify`: owners keep a fixed
// key order, and `undefined` identity parts disappear from the serialized text.
const snapshotOwner = (owner: PublicOwner): object => ({
	instanceId: owner.instanceId,
	pluginId: owner.pluginId,
	version: owner.version,
})

type PublicSchemaSurface = CompiledApplication<
	readonly SchemaDefinition[]
>['schemaSurfaces'][number]

// Both projections retain the same mutation identity and provenance.
const snapshotMutations = (
	commands: PublicSchemaSurface['schemaMutations'],
): readonly object[] =>
	[...commands.entries()].map(([name, command]) => ({
		contributionId: command.contributionId,
		name,
		mutation: command.mutation,
		owner: snapshotOwner(command.owner),
		staticOptions: command.staticOptions,
	}))

/** Creates the callback-free public graph compared by the determinism check. */
export const createPluginStaticConformanceSnapshot = (
	ultimabase: UltimaBase<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): object => {
	const application = ultimabase.compile()

	return {
		fieldBuilderMethods: application.fieldBuilderMethods.map((method) => ({
			contexts: Object.fromEntries(
				Object.entries(method.contexts).map(([context, implementation]) => [
					context,
					{ fieldKind: implementation.fieldKind },
				]),
			),
			name: method.name,
			owner: method.owner,
		})),
		operations: application.operations.map(({ operation, owner }) => ({
			errors: operation.errors,
			name: operation.name,
			owner: snapshotOwner(owner),
			target: operation.target,
			transaction: operation.transaction,
			version: operation.version,
		})),
		privilegeReport: application.pluginPrivilegeReport,
		schemas: [...application.schemas.values()].map((schema) => ({
			className: schema.className,
			fields: Object.entries(schema.definition.fields)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([name, field]) => ({ kind: field.kind, name })),
			indexes: schema.definition.indexes,
			provenance: schema.definition.provenance,
		})),
		surfaces: application.schemaSurfaces.map((surface) => ({
			className: surface.schema.className,
			schemaMutations: snapshotMutations(surface.schemaMutations),
		})),
	}
}

const readContributionProvenance = (
	provenance: SchemaCompilationProvenance,
): readonly SchemaContributionProvenance[] => [
	provenance.schema,
	...Object.values(provenance.fields),
	...provenance.indexes.map(({ provenance: value }) => value),
	...provenance.patches.map(({ provenance: value }) => value),
	...Object.values(provenance.options).flatMap(({ definition, value }) => [
		definition,
		value,
	]),
	...Object.values(provenance.fieldOptions).flatMap((options) =>
		Object.values(options).flatMap(({ definition, value }) => [
			definition,
			value,
		]),
	),
]

/** Verifies that every public plugin provenance owner names one configured version. */
export const assertPublicPluginProvenance = (
	ultimabase: UltimaBase<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): void => {
	const application = ultimabase.compile()
	const configured = new Map(
		application.pluginPrivilegeReport.plugins.map((plugin) => [
			`${plugin.identity.pluginId}\u0000${plugin.identity.instanceId ?? ''}`,
			plugin.version,
		]),
	)
	const assertOwner = (owner: SchemaContributionProvenance['owner']): void => {
		if (owner.kind !== 'plugin') return
		const version = configured.get(
			`${owner.pluginId}\u0000${owner.instanceId ?? ''}`,
		)
		if (version !== owner.version) {
			throw new TypeError(
				`Unconfigured plugin provenance owner: ${owner.pluginId}@${owner.version}`,
			)
		}
	}

	for (const schema of application.schemas.values()) {
		for (const provenance of readContributionProvenance(
			schema.definition.provenance,
		)) {
			assertOwner(provenance.owner)
		}
	}
	for (const { owner } of application.operations) assertOwner(owner)
}
