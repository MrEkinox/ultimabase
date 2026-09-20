import type {
	FrameworkApplication,
	PluginDefinition,
	SchemaDefinition,
	SchemaContributionProvenance,
	SchemaCompilationProvenance,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

const snapshotOwner = (
	owner: Readonly<{
		readonly instanceId?: string
		readonly pluginId: string
		readonly version?: string
	}>,
): Readonly<{
	readonly instanceId?: string
	readonly pluginId: string
	readonly version?: string
}> =>
	immutableRecord({
		...(owner.instanceId === undefined ? {} : { instanceId: owner.instanceId }),
		pluginId: owner.pluginId,
		...(owner.version === undefined ? {} : { version: owner.version }),
	})

type PublicSchemaSurface = FrameworkApplication<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
>['typegenGraph']['schemaSurfaces'][number]

const snapshotSurface = (surface: PublicSchemaSurface): object => {
	const snapshotCommands = (
		commands: PublicSchemaSurface['schemaCommands'],
	): readonly object[] =>
		immutableArray(
			[...commands.entries()].map(([name, command]) =>
				immutableRecord({
					contributionId: command.contributionId,
					name,
					operation: command.operation.name,
					owner: snapshotOwner(command.owner),
					staticOptions: command.staticOptions,
				}),
			),
		)

	return immutableRecord({
		className: surface.schema.className,
		modelCommands: snapshotCommands(surface.modelCommands),
		queryExtensions: immutableArray(
			[...surface.queryExtensions.entries()].map(([name, query]) =>
				immutableRecord({
					contributionId: query.contributionId,
					input: query.extension.input.typegen,
					name,
					owner: snapshotOwner(query.owner),
					staticOptions: query.staticOptions,
					version: query.extension.version,
				}),
			),
		),
		schemaCommands: snapshotCommands(surface.schemaCommands),
	})
}

/** Creates the callback-free public graph compared by the determinism check. */
export const createPluginStaticConformanceSnapshot = (
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): object => {
	application.compileSchemas()
	const graph = application.typegenGraph

	return immutableRecord({
		fieldBuilderMethods: immutableArray(
			application.fieldBuilderMethods.map((method) =>
				immutableRecord({
					contexts: Object.fromEntries(
						Object.entries(method.contexts).map(([context, implementation]) => [
							context,
							{
								fieldKind: implementation.fieldKind,
								typegen: implementation.typegen,
							},
						]),
					),
					name: method.name,
					owner: method.owner,
				}),
			),
		),
		operations: immutableArray(
			graph.operations.map(({ operation, owner }) =>
				immutableRecord({
					errors: operation.errors,
					input: operation.input.typegen,
					name: operation.name,
					owner: snapshotOwner(owner),
					result: operation.result.typegen,
					target: operation.target,
					transaction: operation.transaction,
					version: operation.version,
				}),
			),
		),
		pluginDeclarations: graph.declarations,
		pluginOptions: graph.options,
		privilegeReport: application.pluginPrivilegeReport,
		schemas: immutableArray(
			application.schemas.values().map((schema) =>
				immutableRecord({
					className: schema.className,
					constraints: schema.definition.constraints,
					fields: immutableArray(
						Object.entries(schema.definition.fields)
							.sort(([left], [right]) => left.localeCompare(right))
							.map(([name, field]) =>
								immutableRecord({ kind: field.kind, name }),
							),
					),
					indexes: schema.definition.indexes,
					provenance: schema.definition.provenance,
				}),
			),
		),
		surfaces: immutableArray(graph.schemaSurfaces.map(snapshotSurface)),
	})
}

const readContributionProvenance = (
	provenance: SchemaCompilationProvenance,
): readonly SchemaContributionProvenance[] =>
	immutableArray([
		provenance.schema,
		...Object.values(provenance.fields),
		...provenance.indexes.map(({ provenance: value }) => value),
		...provenance.constraints.map(({ provenance: value }) => value),
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
	])

/** Verifies that every public plugin provenance owner names one configured version. */
export const assertPublicPluginProvenance = (
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): void => {
	application.compileSchemas()
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
	for (const { owner } of application.typegenGraph.operations)
		assertOwner(owner)
	for (const option of application.typegenGraph.options)
		assertOwner(option.owner)
	for (const declarations of application.typegenGraph.declarations) {
		for (const contribution of declarations.contributions) {
			assertOwner(contribution.owner)
		}
		for (const output of declarations.outputs) assertOwner(output.owner)
		for (const reference of declarations.references)
			assertOwner(reference.owner)
	}
}
