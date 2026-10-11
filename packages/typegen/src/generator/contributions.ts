import type {
	TypegenApplicationSnapshot,
	TypegenReference,
	TypegenSchemaMutationSnapshot,
} from '../snapshot.js'
import { propertyName, quote } from './syntax.js'
import type { RenderContext } from './types.js'

const renderErrors = (errors: readonly string[]): string =>
	`readonly [${errors.map(quote).join(', ')}]`

/** Renders plugin operations and schema-mutation surfaces as registry augmentations. */
export const renderGeneratedSurfaces = (
	snapshot: TypegenApplicationSnapshot,
	context: RenderContext,
): string => {
	const typeOf = (reference: TypegenReference | undefined): string =>
		reference === undefined ? 'unknown' : context.imports.alias(reference)
	const renderMutationDefinition = (
		mutation: TypegenSchemaMutationSnapshot,
	): string => {
		const select =
			mutation.select.length === 0
				? 'Readonly<Record<never, never>>'
				: `Readonly<{ ${mutation.select.map((field) => `readonly ${propertyName(field)}: true`).join('; ')} }>`
		// The target argument appears only for many-row commands, so one-row
		// output stays unchanged.
		const target =
			mutation.target === 'many' ? `, ${quote(mutation.target)}` : ''
		return `CorePlugin.PluginSchemaMutationDefinition<${quote(mutation.mutation)}, ${quote(mutation.version)}, ${typeOf(mutation.input)}, ${renderErrors(mutation.errors)}, ${quote(mutation.authority)}, ${quote(mutation.effect)}, ${quote(mutation.returning)}, ${select}${target}>`
	}
	const renderSurfaceType = (
		mutations: readonly TypegenSchemaMutationSnapshot[],
		className: string,
	): string => {
		if (mutations.length === 0) return 'Readonly<Record<never, never>>'
		// One descriptor owns each command's input, authority and result
		// contract for this schema.
		return `{
${mutations
	.map(
		(mutation) =>
			`\t\t\t\treadonly ${propertyName(mutation.name)}: Core.${mutation.target === 'many' ? 'ApplicationSchemaMutationManyMethod' : 'ApplicationSchemaMutationMethod'}<Core.SchemaReference<${quote(className)}>, Core.UltimaBaseGeneratedSchemaSurfaces[${quote(className)}]["schemaMutations"][${quote(mutation.name)}]>`,
	)
	.join('\n')}
\t\t\t}`
	}
	const operations = snapshot.operations.map(
		(operation) =>
			`\t\treadonly ${quote(operation.name)}: CorePlugin.PluginOperationDefinition<${quote(operation.name)}, ${quote(operation.version)}, ${quote(operation.target)}, ${typeOf(operation.input)}, ${typeOf(operation.result)}, ${renderErrors(operation.errors)}>`,
	)
	// Empty projections remain compiled graph facts, but add no ambient types.
	const surfaces = snapshot.surfaces
		.filter((surface) => surface.schemaMutations.length > 0)
		.map((surface) => {
			const schemaMutations = [...surface.schemaMutations]
				.sort((left, right) => left.name.localeCompare(right.name))
				.map(
					(mutation) =>
						`\t\t\treadonly ${propertyName(mutation.name)}: ${renderMutationDefinition(mutation)}`,
				)
				.join('\n')
			return `\t\treadonly ${quote(surface.className)}: {
\t\t\treadonly schema: ${renderSurfaceType(surface.schemaMutations, surface.className)}
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
