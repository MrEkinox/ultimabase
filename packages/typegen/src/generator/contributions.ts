import type { TypegenApplicationSnapshot } from '../snapshot.js'
import { propertyName, quote } from './syntax.js'
import type { RenderContext } from './types.js'

export const renderGeneratedSurfaces = (
	snapshot: TypegenApplicationSnapshot,
	context: RenderContext,
): string => {
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
		mutations: TypegenApplicationSnapshot['surfaces'][number]['schemaMutations'],
		className: string,
		method:
			| 'ApplicationModelSchemaMutationMethod'
			| 'ApplicationSchemaMutationMethod',
	): string => {
		if (mutations.length === 0) return 'Readonly<Record<never, never>>'
		// Core rejects duplicate aliases across surfaces; one descriptor owns
		// each command's input, authority and result contract for this schema.
		const mutationType = `{
${mutations
	.map(
		(mutation) =>
			`\t\t\t\treadonly ${propertyName(mutation.name)}: Core.${method}<Core.SchemaReference<${quote(className)}>, Core.UltimaBaseGeneratedSchemaSurfaces[${quote(className)}]["schemaMutations"][${quote(mutation.name)}]>`,
	)
	.join('\n')}
\t\t\t}`
		return mutationType
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
	// Empty projections remain compiled graph facts, but add no ambient types.
	const surfaces = snapshot.surfaces
		.filter(
			(surface) =>
				surface.schemaMutations.length + surface.modelMutations.length > 0,
		)
		.map((surface) => {
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
\t\t\treadonly model: ${renderSurfaceType(surface.modelMutations, surface.className, 'ApplicationModelSchemaMutationMethod')}
\t\t\treadonly schema: ${renderSurfaceType(surface.schemaMutations, surface.className, 'ApplicationSchemaMutationMethod')}
\t\t\treadonly schemaMutations: {
${schemaMutations}
\t\t\t}
\t\t}`
		})
	return [
		operations.length === 0
			? ''
			: `\tinterface UltimaBaseGeneratedOperations {
${operations.join('\n')}
\t}`,
		surfaces.length === 0
			? ''
			: `\tinterface UltimaBaseGeneratedSchemaSurfaces {
${surfaces.join('\n')}
\t}`,
	]
		.filter(Boolean)
		.join('\n')
}
