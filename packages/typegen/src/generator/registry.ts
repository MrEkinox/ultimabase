import type { TypegenApplicationSnapshot } from '../snapshot.js'
import { hasRelationships } from './schema.js'
import { propertyName, quote, renderUnion } from './syntax.js'
import type { RenderContext } from './types.js'
import { renderGeneratedSurfaces } from './contributions.js'
import { SchemaTypegenError } from '../errors.js'

export const renderSchemas = (
	snapshot: TypegenApplicationSnapshot,
	context: RenderContext,
): string => {
	const schemas = snapshot.schemas.map((schema) => {
		const alias = context.identifiers.schema(schema)
		const persistedFields = renderUnion(
			schema.fields.map(({ name }) => quote(name)),
		)
		const selectableFields = renderUnion(
			[...schema.fields, ...schema.virtualFields].map(({ name }) =>
				quote(name),
			),
		)
		const numericFields = renderUnion(
			schema.fields
				.filter(
					(field) =>
						!field.typegen.list &&
						['bigint', 'decimal', 'float', 'int'].includes(field.kind),
				)
				.map(({ name }) => quote(name)),
		)
		const relationships = schema.fields.flatMap((field) =>
			field.value.kind === 'pointer' || field.value.kind === 'relation'
				? [
						`\t\t\treadonly ${propertyName(field.name)}: { readonly kind: ${quote(field.value.kind)}; readonly target: ${quote(field.value.target)} }`,
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
\t\treadonly fields: ${selectableFields}
\t\treadonly item: ${alias}Item
\t\treadonly numericFields: ${numericFields}
\t\treadonly output: ${alias}Output
\t\treadonly persistedFields: ${persistedFields}
\t\treadonly selectableFields: ${selectableFields}
${relationshipMap}\t\treadonly inputs: {
\t\t\treadonly create: ${alias}CreateInput
\t\t\treadonly dependencySelect: ${alias}DependencySelect
${include}\t\t\treadonly nestedCreate: ${alias}NestedCreateInput
			readonly nestedUpdate: ${alias}NestedUpdateData
			readonly orderBy: ${alias}OrderByInput
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

	const builderInterfaceNames = {
		embedded: 'UltimaBaseGeneratedEmbeddedFieldBuilderMethods',
		output: 'UltimaBaseGeneratedOutputBuilderMethods',
		stored: 'UltimaBaseGeneratedFieldBuilderMethods',
		virtual: 'UltimaBaseGeneratedVirtualFieldBuilderMethods',
	} as const
	const builderMethods = Object.entries(builderInterfaceNames)
		.map(([fieldContext, interfaceName]) => {
			const methods = snapshot.fieldMethods
				.filter(({ context }) => context === fieldContext)
				.map(
					(method) =>
						`\t\treadonly ${propertyName(method.name)}: ${context.imports.alias(method.method)}`,
				)
				.join('\n')
			return methods === ''
				? ''
				: `\n\tinterface ${interfaceName} {\n${methods}\n\t}`
		})
		.join('')
	const optionNames = new Map<string, string>()
	for (const option of snapshot.options) {
		const key = `${option.scope}\u0000${option.name}`
		const prior = optionNames.get(key)
		const reference = `${option.reference.module}:${option.reference.exportName}:${option.compatibility?.module ?? ''}:${option.compatibility?.exportName ?? ''}`
		if (prior !== undefined && prior !== reference) {
			throw new SchemaTypegenError(
				'generated-identity-conflict',
				`Generated ${option.scope} option "${option.name}" has conflicting public types`,
				{ owner: option.owner.pluginId, path: option.name },
			)
		}
		optionNames.set(key, reference)
	}
	const renderOptions = (
		scope: 'field' | 'schema',
		fieldContext?: 'stored' | 'embedded' | 'virtual' | 'output',
	): string =>
		snapshot.options
			.filter(
				(option, index, values) =>
					option.scope === scope &&
					(fieldContext === undefined ||
						option.contexts?.includes(fieldContext) === true) &&
					values.findIndex(
						(candidate) =>
							candidate.scope === scope && candidate.name === option.name,
					) === index,
			)
			.map(
				(option) =>
					`\t\treadonly ${propertyName(option.name)}?: ${context.imports.alias(option.reference)}${option.generic === 'self' ? '<this>' : ''}`,
			)
			.join('\n')
	const fieldOptions = renderOptions('field', 'stored')
	const embeddedFieldOptions = renderOptions('field', 'embedded')
	const virtualFieldOptions = renderOptions('field', 'virtual')
	const outputOptions = renderOptions('field', 'output')
	const schemaOptions = renderOptions('schema')
	const fieldCompatibility = snapshot.options
		.filter(
			(option, index, values) =>
				option.scope === 'field' &&
				option.compatibility !== undefined &&
				values.findIndex(
					(candidate) =>
						candidate.scope === 'field' && candidate.name === option.name,
				) === index,
		)
		.flatMap((option) =>
			option.compatibility === undefined
				? []
				: [
						`\t\treadonly ${propertyName(option.name)}: ${context.imports.alias(option.compatibility)}<TOptions, TValue>`,
					],
		)
		.join('\n')
	const optionInterfaces = `${fieldOptions === '' ? '' : `\n\tinterface UltimaBaseGeneratedFieldOptions {\n${fieldOptions}\n\t}`}${embeddedFieldOptions === '' ? '' : `\n\tinterface UltimaBaseGeneratedEmbeddedFieldOptions {\n${embeddedFieldOptions}\n\t}`}${virtualFieldOptions === '' ? '' : `\n\tinterface UltimaBaseGeneratedVirtualFieldOptions {\n${virtualFieldOptions}\n\t}`}${outputOptions === '' ? '' : `\n\tinterface UltimaBaseGeneratedOutputOptions {\n${outputOptions}\n\t}`}${fieldCompatibility === '' ? '' : `\n\tinterface UltimaBaseGeneratedFieldOptionCompatibility<TOptions extends object, TValue> {\n${fieldCompatibility}\n\t}`}${schemaOptions === '' ? '' : `\n\tinterface UltimaBaseGeneratedSchemaOptions {\n${schemaOptions}\n\t}`}`
	const surfaces = renderGeneratedSurfaces(snapshot, context)

	return `declare module '@ultimabase/core' {\n\tinterface UltimaBaseGeneratedRegistryState {\n\t\treadonly application: true\n\t}\n\tinterface UltimaBaseGeneratedSchemas {\n${schemas.join('\n')}\n\t}${builderMethods}${optionInterfaces}\n${surfaces}\n}`
}
