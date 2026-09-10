import type {
	TypegenNamedDeclaration,
	TypegenPropertyNode,
	TypegenTypeNode,
} from '@ultimabase/core'

import type {
	TypegenApplicationSnapshot,
	TypegenOwnerSnapshot,
} from '../snapshot.js'
import { SchemaTypegenError } from '../errors.js'
import { propertyName, quote, renderDocumentation } from './syntax.js'
import type { RenderContext } from './types.js'

const ownerName = (owner: TypegenOwnerSnapshot): string =>
	owner.instanceId === undefined
		? owner.pluginId
		: `${owner.pluginId}#${owner.instanceId}`

export const renderTypeNode = (
	node: TypegenTypeNode,
	context: RenderContext,
): string => {
	switch (node.kind) {
		case 'bigint':
		case 'boolean':
		case 'never':
		case 'number':
		case 'string':
		case 'unknown':
			return node.kind
		case 'literal':
			return JSON.stringify(node.value)
		case 'reference': {
			const alias = context.imports.alias(node.reference)
			return node.arguments === undefined || node.arguments.length === 0
				? alias
				: `${alias}<${node.arguments.map((value) => renderTypeNode(value, context)).join(', ')}>`
		}
		case 'array':
			return `readonly (${renderTypeNode(node.value, context)})[]`
		case 'tuple':
			return `readonly [${node.values.map((value) => renderTypeNode(value, context)).join(', ')}]`
		case 'union':
			return node.values
				.map((value) => renderTypeNode(value, context))
				.join(' | ')
		case 'object':
			return renderObjectType(node.properties, context)
	}
}

const renderProperty = (
	property: TypegenPropertyNode,
	context: RenderContext,
	indent = '\t',
): string =>
	`${renderDocumentation(property.description).replaceAll(/^/gmu, indent.slice(1))}${indent}${property.readonly === false ? '' : 'readonly '}${propertyName(property.name)}${property.optional === true ? '?' : ''}: ${renderTypeNode(property.type, context)}`

export const renderObjectType = (
	properties: readonly TypegenPropertyNode[],
	context: RenderContext,
): string =>
	properties.length === 0
		? 'Readonly<Record<never, never>>'
		: `{\n${properties.map((property) => renderProperty(property, context)).join('\n')}\n}`

const assertUniqueDeclarations = (
	declarations: readonly Readonly<{
		readonly declaration: TypegenNamedDeclaration
		readonly owner: TypegenOwnerSnapshot
	}>[],
): void => {
	const owners = new Map<string, TypegenOwnerSnapshot>()
	for (const { declaration, owner } of declarations) {
		const prior = owners.get(declaration.name)
		if (prior !== undefined) {
			throw new SchemaTypegenError(
				'generated-identity-conflict',
				`Generated declaration "${declaration.name}" from "${ownerName(owner)}" conflicts with "${ownerName(prior)}"`,
				{ owner: ownerName(owner), path: declaration.name },
			)
		}
		owners.set(declaration.name, owner)
	}
}

export const renderContributedDeclarations = (
	snapshot: TypegenApplicationSnapshot,
	context: RenderContext,
): string => {
	const declarations = snapshot.contributions.flatMap((contribution) =>
		contribution.declarations.map((declaration) => ({
			declaration,
			owner: contribution.owner,
		})),
	)
	assertUniqueDeclarations(declarations)
	return declarations
		.map(
			({ declaration }) =>
				`${renderDocumentation(declaration.description)}export type ${declaration.name} = ${renderTypeNode(declaration.type, context)}`,
		)
		.join('\n\n')
}

export const renderStandaloneDeclarations = (
	declarations: readonly TypegenNamedDeclaration[],
	context: RenderContext,
): string =>
	declarations
		.map(
			(declaration) =>
				`${renderDocumentation(declaration.description)}export type ${declaration.name} = ${renderTypeNode(declaration.type, context)}`,
		)
		.join('\n\n')

const augmentationFor = (
	snapshot: TypegenApplicationSnapshot,
	target: string,
	kind: 'model' | 'schema',
): readonly TypegenPropertyNode[] =>
	snapshot.contributions.flatMap((contribution) =>
		contribution.augmentations
			.filter((augmentation) => augmentation.target === target)
			.flatMap((augmentation) => augmentation[kind] ?? []),
	)

export const renderGeneratedSurfaces = (
	snapshot: TypegenApplicationSnapshot,
	context: RenderContext,
): string => {
	const surfacesByName = new Map(
		snapshot.surfaces.map((surface) => [surface.className, surface]),
	)
	for (const contribution of snapshot.contributions) {
		for (const augmentation of contribution.augmentations) {
			const surface = surfacesByName.get(augmentation.target)
			if (surface === undefined) {
				throw new SchemaTypegenError(
					'malformed-plugin-contribution',
					`Typegen augmentation targets unknown schema: ${augmentation.target}`,
					{ owner: ownerName(contribution.owner), path: augmentation.target },
				)
			}
			for (const [kind, properties] of [
				['schema', augmentation.schema ?? []],
				['model', augmentation.model ?? []],
			] as const) {
				const available =
					kind === 'schema'
						? [
								...surface.schemaCommands,
								...surface.schemaMutations,
								...surface.queryExtensions,
							]
						: [...surface.modelCommands, ...surface.modelMutations]
				for (const property of properties) {
					const runtimeSurface = available.find(
						(candidate) => candidate.name === property.name,
					)
					if (
						runtimeSurface === undefined ||
						ownerName(runtimeSurface.owner) !== ownerName(contribution.owner)
					) {
						throw new SchemaTypegenError(
							'malformed-plugin-contribution',
							`Typegen augmentation ${augmentation.target}.${property.name} has no same-owner Runtime surface`,
							{
								owner: ownerName(contribution.owner),
								path: `${augmentation.target}.${property.name}`,
							},
						)
					}
				}
			}
		}
	}
	const operationByName = new Map(
		snapshot.operations.map((operation) => [operation.name, operation]),
	)
	const renderMutationDefinition = (
		mutation: TypegenApplicationSnapshot['surfaces'][number]['schemaMutations'][number],
	): string => {
		const input =
			mutation.input === undefined
				? 'unknown'
				: context.imports.alias(mutation.input)
		const errors = `readonly [${mutation.errors.map(quote).join(', ')}]`
		const select =
			mutation.select.length === 0
				? 'Readonly<Record<never, never>>'
				: `Readonly<{ ${mutation.select.map((field) => `readonly ${propertyName(field)}: true`).join('; ')} }>`
		return `Core.PluginSchemaMutationDefinition<${quote(mutation.mutation)}, ${quote(mutation.version)}, ${input}, ${errors}, ${quote(mutation.authority)}, ${quote(mutation.effect)}, ${quote(mutation.returning)}, ${select}>`
	}
	const renderSurfaceType = (
		properties: readonly TypegenPropertyNode[],
		mutations: TypegenApplicationSnapshot['surfaces'][number]['schemaMutations'],
		className: string,
		method:
			| 'ApplicationModelSchemaMutationMethod'
			| 'ApplicationSchemaMutationMethod',
	): string => {
		if (mutations.length === 0) return renderObjectType(properties, context)
		const mutationType = `{
${mutations
	.map(
		(mutation) =>
			`\t\t\t\treadonly ${propertyName(mutation.name)}: Core.${method}<Core.SchemaReference<${quote(className)}>, ${renderMutationDefinition(mutation)}>`,
	)
	.join('\n')}
\t\t\t}`
		return properties.length === 0
			? mutationType
			: `${renderObjectType(properties, context)} & ${mutationType}`
	}
	const operations = snapshot.operations.map((operation) => {
		const input =
			operation.input === undefined
				? 'unknown'
				: context.imports.alias(operation.input)
		const result =
			operation.result === undefined
				? 'unknown'
				: context.imports.alias(operation.result)
		const errors = `readonly [${operation.errors.map(quote).join(', ')}]`
		return `\t\treadonly ${quote(operation.name)}: Core.PluginOperationDefinition<${quote(operation.name)}, ${quote(operation.version)}, ${quote(operation.target)}, ${input}, ${result}, ${errors}>`
	})
	const surfaces = snapshot.surfaces.map((surface) => {
		const renderCommands = (commands: typeof surface.schemaCommands): string =>
			commands
				.map((command) => {
					if (!operationByName.has(command.operation)) {
						throw new SchemaTypegenError(
							'malformed-plugin-contribution',
							`Surface ${surface.className}.${command.name} references unknown operation ${command.operation}`,
							{ owner: command.owner.pluginId, path: surface.className },
						)
					}
					return `\t\t\treadonly ${propertyName(command.name)}: ${quote(command.operation)}`
				})
				.join('\n')
		const queries = surface.queryExtensions
			.map((query) => {
				const input =
					query.input === undefined
						? 'unknown'
						: context.imports.alias(query.input)
				return `\t\t\treadonly ${propertyName(query.name)}: Core.QueryExtensionDefinition<${quote(query.name)}, ${quote(query.version)}, ${input}>`
			})
			.join('\n')
		const schemaMutations = [
			...surface.schemaMutations,
			...surface.modelMutations.filter(
				(modelMutation) =>
					!surface.schemaMutations.some(
						(schemaMutation) => schemaMutation.name === modelMutation.name,
					),
			),
		]
			.sort((left, right) => left.name.localeCompare(right.name))
			.map(
				(mutation) =>
					`\t\t\treadonly ${propertyName(mutation.name)}: ${renderMutationDefinition(mutation)}`,
			)
			.join('\n')
		return `\t\treadonly ${quote(surface.className)}: {
\t\t\treadonly model: ${renderSurfaceType(augmentationFor(snapshot, surface.className, 'model'), surface.modelMutations, surface.className, 'ApplicationModelSchemaMutationMethod')}
\t\t\treadonly modelCommands: {
${renderCommands(surface.modelCommands)}
\t\t\t}
\t\t\treadonly queries: {
${queries}
\t\t\t}
\t\t\treadonly schema: ${renderSurfaceType(augmentationFor(snapshot, surface.className, 'schema'), surface.schemaMutations, surface.className, 'ApplicationSchemaMutationMethod')}
\t\t\treadonly schemaCommands: {
${renderCommands(surface.schemaCommands)}
\t\t\t}
\t\t\treadonly schemaMutations: {
${schemaMutations}
\t\t\t}
\t\t}`
	})
	return `\tinterface UltimaBaseGeneratedOperations {
${operations.join('\n')}
\t}
\tinterface UltimaBaseGeneratedSchemaSurfaces {
${surfaces.join('\n')}
\t}`
}
