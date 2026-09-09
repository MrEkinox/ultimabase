import type { CompiledTypegenGraph } from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { SchemaTypegenError } from '../errors.js'
import type {
	TypegenApplicationSnapshot,
	TypegenCommandSnapshot,
	TypegenOwnerSnapshot,
	TypegenReference,
} from '../snapshot.js'

const snapshotOwner = (
	owner: Readonly<{
		readonly instanceId?: string
		readonly pluginId: string
		readonly version: string
	}>,
): TypegenOwnerSnapshot =>
	immutableRecord({
		...(owner.instanceId === undefined ? {} : { instanceId: owner.instanceId }),
		pluginId: owner.pluginId,
		version: owner.version,
	})

const ownerKey = (owner: TypegenOwnerSnapshot): string =>
	`${owner.pluginId}\u0000${owner.instanceId ?? ''}`

const snapshotReference = (
	reference: TypegenReference | undefined,
): TypegenReference | undefined =>
	reference === undefined
		? undefined
		: immutableRecord({
				exportName: reference.exportName,
				module: reference.module,
			})

const assertUniqueContributionIdentities = (
	graph: CompiledTypegenGraph,
): void => {
	const contributionIds = new Set<string>()
	const outputIds = new Set<string>()
	const outputPaths = new Map<string, string>()
	for (const declaration of graph.declarations) {
		for (const contribution of declaration.contributions) {
			const owner = snapshotOwner(contribution.owner)
			const key = `${ownerKey(owner)}\u0000${contribution.contributionId}`
			if (contributionIds.has(key)) {
				throw new SchemaTypegenError(
					'generated-identity-conflict',
					`Duplicate Typegen contributionId: ${contribution.contributionId}`,
					{ owner: owner.pluginId, path: contribution.contributionId },
				)
			}
			contributionIds.add(key)
		}
		for (const output of declaration.outputs) {
			const owner = snapshotOwner(output.owner)
			const key = `${ownerKey(owner)}\u0000${output.contributionId}`
			if (outputIds.has(key)) {
				throw new SchemaTypegenError(
					'generated-identity-conflict',
					`Duplicate Typegen output contributionId: ${output.contributionId}`,
					{ owner: owner.pluginId, path: output.outputPath },
				)
			}
			outputIds.add(key)
			const prior = outputPaths.get(output.outputPath)
			if (prior !== undefined) {
				throw new SchemaTypegenError(
					'output-path-conflict',
					`Typegen output "${output.outputPath}" from "${owner.pluginId}" conflicts with "${prior}"`,
					{ owner: owner.pluginId, path: output.outputPath },
				)
			}
			outputPaths.set(output.outputPath, owner.pluginId)
		}
	}
}

const createReferenceReader = (graph: CompiledTypegenGraph) => {
	const registered = new Map<string, ReadonlySet<object>>()
	for (const declaration of graph.declarations) {
		for (const owned of declaration.references) {
			const key = ownerKey(snapshotOwner(owned.owner))
			const references = new Set(registered.get(key) ?? [])
			references.add(owned.reference)
			registered.set(key, references)
		}
	}
	return (
		reference: TypegenReference | undefined,
		owner: TypegenOwnerSnapshot,
		path: string,
	): TypegenReference | undefined => {
		if (reference === undefined) return undefined
		if (!registered.get(ownerKey(owner))?.has(reference)) {
			throw new SchemaTypegenError(
				'malformed-plugin-contribution',
				`${path} uses a Typegen reference not registered by its owner`,
				{ owner: owner.pluginId, path },
			)
		}
		return snapshotReference(reference)
	}
}

/** Detaches the plugin-owned portion of one final Core graph. */
export const snapshotTypegenGraph = (
	graph: CompiledTypegenGraph | undefined,
): Pick<
	TypegenApplicationSnapshot,
	'contributions' | 'operations' | 'options' | 'outputs' | 'surfaces'
> => {
	if (graph === undefined) {
		return immutableRecord({
			contributions: immutableArray([]),
			operations: immutableArray([]),
			options: immutableArray([]),
			outputs: immutableArray([]),
			surfaces: immutableArray([]),
		})
	}
	assertUniqueContributionIdentities(graph)
	const readReference = createReferenceReader(graph)
	const contributions = immutableArray(
		graph.declarations
			.flatMap(({ contributions: values }) => values)
			.sort((left, right) =>
				left.owner.pluginId === right.owner.pluginId
					? left.contributionId.localeCompare(right.contributionId)
					: left.owner.pluginId.localeCompare(right.owner.pluginId),
			)
			.map((value) =>
				immutableRecord({
					augmentations: value.augmentations,
					contributionId: value.contributionId,
					declarations: value.declarations,
					owner: snapshotOwner(value.owner),
					staticOptions: value.staticOptions,
				}),
			),
	)
	const outputs = immutableArray(
		graph.declarations
			.flatMap(({ outputs: values }) => values)
			.sort((left, right) => left.outputPath.localeCompare(right.outputPath))
			.map((value) =>
				immutableRecord({
					contributionId: value.contributionId,
					...(value.declarations === undefined
						? {}
						: { declarations: value.declarations }),
					kind: value.kind,
					...(value.metadata === undefined ? {} : { metadata: value.metadata }),
					outputPath: value.outputPath,
					owner: snapshotOwner(value.owner),
					staticOptions: value.staticOptions,
				}),
			),
	)
	const operations = immutableArray(
		[...graph.operations]
			.sort((left, right) =>
				left.operation.name.localeCompare(right.operation.name),
			)
			.map(({ operation, owner: rawOwner }) => {
				const owner = snapshotOwner(rawOwner)
				return immutableRecord({
					errors: immutableArray(operation.errors),
					input: readReference(
						operation.input.typegen,
						owner,
						`${operation.name}.input`,
					),
					name: operation.name,
					owner,
					result: readReference(
						operation.result.typegen,
						owner,
						`${operation.name}.result`,
					),
					target: operation.target,
					transaction: operation.transaction,
					version: operation.version,
				})
			}),
	)
	const options = immutableArray(
		[...graph.options]
			.sort((left, right) =>
				left.scope === right.scope
					? left.name.localeCompare(right.name)
					: left.scope.localeCompare(right.scope),
			)
			.map((option) =>
				immutableRecord({
					...(option.typegen.compatibilityType === undefined
						? {}
						: {
								compatibility: immutableRecord({
									exportName: option.typegen.compatibilityType,
									module: option.typegen.module,
								}),
							}),
					contributionId: option.contributionId,
					...(option.contexts === undefined
						? {}
						: { contexts: immutableArray(option.contexts) }),
					...(option.typegen.generic === undefined
						? {}
						: { generic: option.typegen.generic }),
					name: option.name,
					owner: snapshotOwner(option.owner),
					reference: immutableRecord({
						exportName: option.typegen.type,
						module: option.typegen.module,
					}),
					scope: option.scope,
					staticOptions: option.staticOptions,
				}),
			),
	)
	const command = (
		name: string,
		value: CompiledTypegenGraph['schemaSurfaces'][number]['schemaCommands'] extends ReadonlyMap<
			string,
			infer TValue
		>
			? TValue
			: never,
	): TypegenCommandSnapshot =>
		immutableRecord({
			contributionId: value.contributionId,
			name,
			operation: value.operation.name,
			owner: snapshotOwner(value.owner),
			staticOptions: value.staticOptions,
		})
	const surfaces = immutableArray(
		[...graph.schemaSurfaces]
			.sort((left, right) =>
				left.schema.className.localeCompare(right.schema.className),
			)
			.map((surface) =>
				immutableRecord({
					className: surface.schema.className,
					modelCommands: immutableArray(
						[...surface.modelCommands]
							.sort(([left], [right]) => left.localeCompare(right))
							.map(([name, value]) => command(name, value)),
					),
					queryExtensions: immutableArray(
						[...surface.queryExtensions]
							.sort(([left], [right]) => left.localeCompare(right))
							.map(([name, value]) => {
								const owner = snapshotOwner(value.owner)
								return immutableRecord({
									contributionId: value.contributionId,
									input: readReference(
										value.extension.input.typegen,
										owner,
										`${surface.schema.className}.${name}.input`,
									),
									name,
									owner,
									staticOptions: value.staticOptions,
									version: value.extension.version,
								})
							}),
					),
					schemaCommands: immutableArray(
						[...surface.schemaCommands]
							.sort(([left], [right]) => left.localeCompare(right))
							.map(([name, value]) => command(name, value)),
					),
				}),
			),
	)
	return immutableRecord({
		contributions,
		operations,
		options,
		outputs,
		surfaces,
	})
}
