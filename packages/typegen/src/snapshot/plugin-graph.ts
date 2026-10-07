import type { CompiledTypegenGraph } from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { SchemaTypegenError } from '../errors.js'
import type {
	TypegenApplicationSnapshot,
	TypegenOwnerSnapshot,
	TypegenReference,
	TypegenSchemaMutationSnapshot,
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
): Pick<TypegenApplicationSnapshot, 'operations' | 'options' | 'surfaces'> => {
	if (graph === undefined) {
		return immutableRecord({
			operations: immutableArray([]),
			options: immutableArray([]),
			surfaces: immutableArray([]),
		})
	}
	const readReference = createReferenceReader(graph)
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
	const mutation = (
		name: string,
		value: CompiledTypegenGraph['schemaSurfaces'][number]['schemaMutations'] extends ReadonlyMap<
			string,
			infer TValue
		>
			? TValue
			: never,
	): TypegenSchemaMutationSnapshot => {
		const owner = snapshotOwner(value.owner)
		return immutableRecord({
			authority: value.mutation.authority,
			contributionId: value.contributionId,
			effect: value.mutation.effect,
			errors: immutableArray(value.mutation.errors),
			input: readReference(
				value.mutation.input.typegen,
				owner,
				`${value.mutation.name}.input`,
			),
			mutation: value.mutation.name,
			name,
			owner,
			returning: value.mutation.returning,
			select: immutableArray(Object.keys(value.mutation.select)),
			staticOptions: value.staticOptions,
			version: value.mutation.version,
		})
	}
	const surfaces = immutableArray(
		[...graph.schemaSurfaces]
			.sort((left, right) =>
				left.schema.className.localeCompare(right.schema.className),
			)
			.map((surface) =>
				immutableRecord({
					className: surface.schema.className,
					modelMutations: immutableArray(
						[...surface.modelMutations]
							.sort(([left], [right]) => left.localeCompare(right))
							.map(([name, value]) => mutation(name, value)),
					),
					schemaMutations: immutableArray(
						[...surface.schemaMutations]
							.sort(([left], [right]) => left.localeCompare(right))
							.map(([name, value]) => mutation(name, value)),
					),
				}),
			),
	)
	return immutableRecord({
		operations,
		options,
		surfaces,
	})
}
