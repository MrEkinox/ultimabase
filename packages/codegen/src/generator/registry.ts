import type { TypegenApplicationSnapshot } from '../snapshot.js'
import { hasRelationships } from './schema.js'
import { propertyName, quote, renderUnion } from './syntax.js'
import type { RenderContext } from './types.js'

export const renderFieldBuilder = (
	snapshot: TypegenApplicationSnapshot,
	context: RenderContext,
): string => {
	const methods = snapshot.fieldMethods.map(
		(method) =>
			`\treadonly ${propertyName(method.name)}: ${context.imports.alias(method.method)}`,
	)

	if (methods.length === 0) {
		return ''
	}

	return [
		`export type ApplicationFieldBuilder = Core.FieldBuilder & {\n${methods.join('\n')}\n}`,
		`export type ApplicationEmbeddedFieldBuilder = Core.EmbeddedFieldBuilder & {\n${methods.join('\n')}\n}`,
	].join('\n')
}

export const renderSchemas = (
	snapshot: TypegenApplicationSnapshot,
	context: RenderContext,
): string => {
	const schemas = snapshot.schemas.map((schema) => {
		const alias = context.identifiers.schema(schema)
		const fields = renderUnion(schema.fields.map(({ name }) => quote(name)))
		const relationships = schema.fields.flatMap((field) =>
			field.value.kind === 'pointer' || field.value.kind === 'relation'
				? [
						`\t\t\treadonly ${propertyName(field.name)}: ${quote(field.value.target)}`,
					]
				: [],
		)
		const relationshipMap =
			relationships.length === 0
				? ''
				: `\t\treadonly relationships: {\n${relationships.join('\n')}\n\t\t}\n`
		const include = hasRelationships(schema)
			? `\t\t\treadonly include: ${alias}Include\n`
			: ''

		return `\texport type ${alias} = {
\t\treadonly key: ${quote(schema.className)}
\t\treadonly fields: ${fields}
\t\treadonly item: ${alias}Item
${relationshipMap}\t\treadonly inputs: {
\t\t\treadonly create: ${alias}CreateInput
${include}\t\t\treadonly orderBy: ${alias}OrderByInput
\t\t\treadonly select: ${alias}Select
\t\t\treadonly update: ${alias}UpdateInput
\t\t\treadonly where: ${alias}WhereInput
\t\t}
\t}`
	})

	return `export declare namespace Schemas {
${schemas.join('\n')}
}`
}

export const renderRegistry = (
	snapshot: TypegenApplicationSnapshot,
	context: RenderContext,
): string => {
	const schemas = snapshot.schemas.map(
		(schema) =>
			`\t\treadonly ${quote(schema.className)}: Schemas.${context.identifiers.schema(schema)}`,
	)

	const fieldMethods = snapshot.fieldMethods.map(
		(method) =>
			`\t\treadonly ${propertyName(method.name)}: ${context.imports.alias(method.method)}`,
	)
	const renderedFieldMethods = fieldMethods.join('\n')
	const builderMethods =
		renderedFieldMethods === ''
			? ''
			: `\n\tinterface UltimaBaseGeneratedFieldBuilderMethods {\n${renderedFieldMethods}\n\t}\n\tinterface UltimaBaseGeneratedEmbeddedFieldBuilderMethods {\n${renderedFieldMethods}\n\t}`

	return `declare module '@ultimabase/core' {\n\tinterface UltimaBaseGeneratedRegistryState {\n\t\treadonly application: true\n\t}\n\tinterface UltimaBaseGeneratedSchemas {\n${schemas.join('\n')}\n\t}${builderMethods}\n}`
}
