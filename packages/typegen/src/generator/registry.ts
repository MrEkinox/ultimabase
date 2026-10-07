import { SchemaTypegenError } from '../errors.js'
import type {
	TypegenApplicationSnapshot,
	TypegenOptionSnapshot,
} from '../snapshot.js'
import { renderGeneratedSurfaces } from './contributions.js'
import { hasRelationships } from './schema.js'
import { propertyName, quote, renderUnion } from './syntax.js'
import type { RenderContext } from './types.js'

const numericKinds = ['bigint', 'decimal', 'float', 'int']

export const renderSchemas = (
	snapshot: TypegenApplicationSnapshot,
	context: RenderContext,
): string => {
	const schemas = snapshot.schemas.map((schema) => {
		const alias = context.identifiers.schema(schema)
		const names = (fields: readonly { readonly name: string }[]): string =>
			renderUnion(fields.map(({ name }) => quote(name)))
		const selectableFields = names([...schema.fields, ...schema.virtualFields])
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
\t\treadonly numericFields: ${names(
			schema.fields.filter(
				(field) => !field.typegen.list && numericKinds.includes(field.kind),
			),
		)}
\t\treadonly output: ${alias}Output
\t\treadonly persistedFields: ${names(schema.fields)}
\t\treadonly selectableFields: ${selectableFields}
${relationshipMap}\t\treadonly inputs: {
\t\t\treadonly create: ${alias}CreateInput
\t\t\treadonly dependencySelect: ${alias}DependencySelect
${include}\t\t\treadonly nestedCreate: ${alias}NestedCreateInput
\t\t\treadonly nestedUpdate: ${alias}NestedUpdateData
\t\t\treadonly orderBy: ${alias}OrderByInput
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

/** Renders one augmented interface, or nothing when it would be empty. */
const renderInterface = (name: string, members: readonly string[]): string =>
	members.length === 0
		? ''
		: `\n\tinterface ${name} {\n${members.join('\n')}\n\t}`

const builderInterfaceNames = [
	['embedded', 'UltimaBaseGeneratedEmbeddedFieldBuilderMethods'],
	['output', 'UltimaBaseGeneratedOutputBuilderMethods'],
	['stored', 'UltimaBaseGeneratedFieldBuilderMethods'],
	['virtual', 'UltimaBaseGeneratedVirtualFieldBuilderMethods'],
] as const

/** Rejects one option name declared with two different public types. */
const assertConsistentOptions = (
	options: readonly TypegenOptionSnapshot[],
): void => {
	const optionTypes = new Map<string, string>()

	for (const option of options) {
		const key = `${option.scope}\u0000${option.name}`
		const prior = optionTypes.get(key)
		const reference = `${option.reference.module}:${option.reference.exportName}:${option.compatibility?.module ?? ''}:${option.compatibility?.exportName ?? ''}`
		if (prior !== undefined && prior !== reference) {
			throw new SchemaTypegenError(
				'generated-identity-conflict',
				`Generated ${option.scope} option "${option.name}" has conflicting public types`,
				{ owner: option.owner.pluginId, path: option.name },
			)
		}
		optionTypes.set(key, reference)
	}
}

export const renderRegistry = (
	snapshot: TypegenApplicationSnapshot,
	context: RenderContext,
): string => {
	const schemas = snapshot.schemas.map(
		(schema) =>
			`\t\treadonly ${quote(schema.className)}: Schemas.${context.identifiers.schema(schema)}`,
	)
	const builderMethods = builderInterfaceNames
		.map(([fieldContext, interfaceName]) =>
			renderInterface(
				interfaceName,
				snapshot.fieldMethods
					.filter((method) => method.context === fieldContext)
					.map(
						(method) =>
							`\t\treadonly ${propertyName(method.name)}: ${context.imports.alias(method.method)}`,
					),
			),
		)
		.join('')

	assertConsistentOptions(snapshot.options)

	// Only the first declaration of each scope and name is rendered, including
	// its contexts; the check above guarantees that later ones carry the same
	// public types.
	const options = snapshot.options.filter(
		(option, index, values) =>
			values.findIndex(
				(candidate) =>
					candidate.scope === option.scope && candidate.name === option.name,
			) === index,
	)
	const renderOptions = (
		name: string,
		scope: 'field' | 'schema',
		fieldContext?: 'stored' | 'embedded' | 'virtual' | 'output',
	): string =>
		renderInterface(
			name,
			options
				.filter(
					(option) =>
						option.scope === scope &&
						(fieldContext === undefined ||
							option.contexts?.includes(fieldContext) === true),
				)
				.map(
					(option) =>
						`\t\treadonly ${propertyName(option.name)}?: ${context.imports.alias(option.reference)}${option.generic === 'self' ? '<this>' : ''}`,
				),
		)
	const fieldCompatibility = options.flatMap((option) =>
		option.scope === 'field' && option.compatibility !== undefined
			? [
					`\t\treadonly ${propertyName(option.name)}: ${context.imports.alias(option.compatibility)}<TOptions, TValue>`,
				]
			: [],
	)
	const optionInterfaces = [
		renderOptions('UltimaBaseGeneratedFieldOptions', 'field', 'stored'),
		renderOptions(
			'UltimaBaseGeneratedEmbeddedFieldOptions',
			'field',
			'embedded',
		),
		renderOptions('UltimaBaseGeneratedVirtualFieldOptions', 'field', 'virtual'),
		renderOptions('UltimaBaseGeneratedOutputOptions', 'field', 'output'),
		renderInterface(
			'UltimaBaseGeneratedFieldOptionCompatibility<TOptions extends object, TValue>',
			fieldCompatibility,
		),
		renderOptions('UltimaBaseGeneratedSchemaOptions', 'schema'),
	].join('')
	const surfaces = renderGeneratedSurfaces(snapshot, context)

	return `declare module '@ultimabase/core' {\n\tinterface UltimaBaseGeneratedRegistryState {\n\t\treadonly application: true\n\t}\n\tinterface UltimaBaseGeneratedSchemas {\n${schemas.join('\n')}\n\t}${builderMethods}${optionInterfaces}\n${surfaces}\n}`
}
