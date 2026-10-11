import type { CompiledTypegenGraph } from '@ultimabase/core/plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { SchemaTypegenError } from '../errors.js'
import type {
	TypegenApplicationSnapshot,
	TypegenOwnerSnapshot,
	TypegenReference,
	TypegenSchemaMutationSnapshot,
} from '../snapshot.js'
import { snapshotReference } from './fields.js'

type SchemaMutationFacts =
	CompiledTypegenGraph['schemaSurfaces'][number]['schemaMutations'] extends ReadonlyMap<
		string,
		infer TValue
	>
		? TValue
		: never

const snapshotOwner = (owner: TypegenOwnerSnapshot): TypegenOwnerSnapshot =>
	immutableRecord({
		...(owner.instanceId === undefined ? {} : { instanceId: owner.instanceId }),
		pluginId: owner.pluginId,
		version: owner.version,
	})

const ownerKey = (owner: TypegenOwnerSnapshot): string =>
	`${owner.pluginId}\u0000${owner.instanceId ?? ''}`

/**
 * Copies command references, accepting only reference objects that the owning
 * plugin instance registered in its declaration batch.
 */
const createReferenceReader = (graph: CompiledTypegenGraph) => {
	const registered = new Map<string, Set<object>>()

	for (const declaration of graph.declarations) {
		for (const { owner, reference } of declaration.references) {
			const key = ownerKey(owner)
			const references = registered.get(key) ?? new Set<object>()

			references.add(reference)
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
		return snapshotReference(reference.exportName, reference.module)
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
			.map((option) => {
				const { typegen } = option
				return immutableRecord({
					...(typegen.compatibilityType === undefined
						? {}
						: {
								compatibility: snapshotReference(
									typegen.compatibilityType,
									typegen.module,
								),
							}),
					contributionId: option.contributionId,
					...(option.contexts === undefined
						? {}
						: { contexts: immutableArray(option.contexts) }),
					...(typegen.generic === undefined
						? {}
						: { generic: typegen.generic }),
					name: option.name,
					owner: snapshotOwner(option.owner),
					reference: snapshotReference(typegen.type, typegen.module),
					scope: option.scope,
					staticOptions: option.staticOptions,
				})
			}),
	)
	const snapshotMutations = (
		mutations: ReadonlyMap<string, SchemaMutationFacts>,
	): readonly TypegenSchemaMutationSnapshot[] =>
		immutableArray(
			[...mutations]
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([name, value]) => {
					const { mutation } = value
					const owner = snapshotOwner(value.owner)
					return immutableRecord({
						authority: mutation.authority,
						contributionId: value.contributionId,
						effect: mutation.effect,
						errors: immutableArray(mutation.errors),
						input: readReference(
							mutation.input.typegen,
							owner,
							`${mutation.name}.input`,
						),
						mutation: mutation.name,
						name,
						owner,
						returning: mutation.returning,
						select: immutableArray(Object.keys(mutation.select)),
						staticOptions: value.staticOptions,
						version: mutation.version,
					})
				}),
		)
	const surfaces = immutableArray(
		[...graph.schemaSurfaces]
			.sort((left, right) =>
				left.schema.className.localeCompare(right.schema.className),
			)
			.map((surface) =>
				immutableRecord({
					className: surface.schema.className,
					schemaMutations: snapshotMutations(surface.schemaMutations),
				}),
			),
	)
	return immutableRecord({ operations, options, surfaces })
}
