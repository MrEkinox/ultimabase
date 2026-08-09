import { createHash } from 'node:crypto'

import { generatedApplicationContractVersion } from '@ultimabase/core'
import type {
	FrameworkApplication,
	PluginDefinition,
	SchemaDefinition,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import { SchemaTypegenError } from './errors.js'
import {
	createTypegenSnapshot,
	type TypegenApplicationSnapshot,
	type TypegenFieldSnapshot,
	type TypegenReference,
	type TypegenSchemaSnapshot,
} from './snapshot.js'

const generatorVersion = 1
const quote = (value: string): string => JSON.stringify(value)
const TypeScriptKeywords = new Set([
	'break',
	'case',
	'catch',
	'class',
	'const',
	'continue',
	'debugger',
	'default',
	'delete',
	'do',
	'else',
	'enum',
	'export',
	'extends',
	'false',
	'finally',
	'for',
	'function',
	'if',
	'import',
	'in',
	'instanceof',
	'new',
	'null',
	'return',
	'super',
	'switch',
	'this',
	'throw',
	'true',
	'try',
	'typeof',
	'var',
	'void',
	'while',
	'with',
])

const typeIdentifier = (value: string): string => {
	const normalized = value.replaceAll(/[^$0-9A-Z_a-z]/gu, '_')
	const prefixed = /^[$A-Z_a-z]/u.test(normalized)
		? normalized
		: `_${normalized}`

	return TypeScriptKeywords.has(prefixed) ? `_${prefixed}` : prefixed
}

const fieldIdentifier = (value: string): string => {
	const normalized = typeIdentifier(value)

	return normalized.length === 0
		? 'Field'
		: `${normalized[0]?.toUpperCase() ?? ''}${normalized.slice(1)}`
}

const renderDocumentation = (description: string | undefined): string => {
	if (description === undefined) {
		return ''
	}

	const normalized = description
		.replaceAll('*/', '* /')
		.replaceAll(/\s+/gu, ' ')

	return `\t/** ${normalized.trim()} */\n`
}

const renderUnion = (values: readonly string[]): string =>
	values.length === 0 ? 'never' : values.join(' | ')

interface ReferenceImport {
	readonly alias: string
	readonly exportName: string
	readonly module: string
}

class ReferenceImports {
	readonly #aliases = new Map<string, string>()
	readonly #imports: ReferenceImport[]

	constructor(snapshot: TypegenApplicationSnapshot) {
		const references = new Map<string, TypegenReference>()

		for (const method of snapshot.fieldMethods) {
			for (const reference of [method.method, method.value]) {
				references.set(
					`${reference.module}\u0000${reference.exportName}`,
					reference,
				)
			}
		}

		for (const schema of snapshot.schemas) {
			this.#collectFieldReferences(schema.fields, references)
		}

		const modules = [
			...new Set([...references.values()].map(({ module }) => module)),
		].sort()
		this.#imports = [...references.values()]
			.sort((left, right) =>
				left.module === right.module
					? left.exportName.localeCompare(right.exportName)
					: left.module.localeCompare(right.module),
			)
			.map((reference) => {
				const moduleIndex = modules.indexOf(reference.module)
				const alias = `Plugin${String(moduleIndex)}_${typeIdentifier(reference.exportName)}`

				this.#aliases.set(
					`${reference.module}\u0000${reference.exportName}`,
					alias,
				)

				return immutableRecord({ ...reference, alias })
			})
	}

	#collectFieldReferences(
		fields: readonly TypegenFieldSnapshot[],
		references: Map<string, TypegenReference>,
	): void {
		for (const field of fields) {
			if (field.value.kind === 'plugin') {
				references.set(
					`${field.value.reference.module}\u0000${field.value.reference.exportName}`,
					field.value.reference,
				)
			}

			if (field.value.kind === 'object') {
				this.#collectFieldReferences(field.value.fields, references)
			}
		}
	}

	alias(reference: TypegenReference): string {
		const alias = this.#aliases.get(
			`${reference.module}\u0000${reference.exportName}`,
		)

		if (alias === undefined) {
			throw new TypeError(
				`Missing generated import for ${reference.module}:${reference.exportName}`,
			)
		}

		return alias
	}

	render(): string {
		const byModule = new Map<string, ReferenceImport[]>()

		for (const entry of this.#imports) {
			const entries = byModule.get(entry.module) ?? []

			entries.push(entry)
			byModule.set(entry.module, entries)
		}

		return [...byModule.entries()]
			.map(([module, entries]) => {
				const specifiers = entries
					.map(({ alias, exportName }) => `\t${exportName} as ${alias},`)
					.join('\n')

				return `import type {\n${specifiers}\n} from ${quote(module)}`
			})
			.join('\n')
	}
}

type FieldValueMode = 'create' | 'object' | 'update'

interface ObjectDescriptor {
	readonly alias: string
	readonly field: TypegenFieldSnapshot
	readonly ownerPath: string
	readonly schema: TypegenSchemaSnapshot
}

interface EnumDescriptor {
	readonly alias: string
	readonly field: TypegenFieldSnapshot
	readonly ownerPath: string
	readonly schema: TypegenSchemaSnapshot
}

interface ObjectOccurrence {
	readonly descriptor: ObjectDescriptor
	readonly field: TypegenFieldSnapshot
	readonly schema: TypegenSchemaSnapshot
}

class GeneratedIdentifiers {
	readonly #owners = new Map<string, string>()
	readonly #objectsByField = new Map<TypegenFieldSnapshot, ObjectDescriptor>()
	readonly #objects: ObjectDescriptor[] = []
	readonly #objectOccurrences: ObjectOccurrence[] = []
	readonly #enumsByField = new Map<TypegenFieldSnapshot, EnumDescriptor>()
	readonly #enums: EnumDescriptor[] = []
	readonly #namedIdentities = new Map<
		string,
		Readonly<{
			descriptor: EnumDescriptor | ObjectDescriptor
			signature: string
		}>
	>()
	readonly #schemas = new Map<TypegenSchemaSnapshot, string>()

	constructor(snapshot: TypegenApplicationSnapshot) {
		for (const schema of snapshot.schemas) {
			const alias = typeIdentifier(schema.className)

			for (const suffix of [
				'Access',
				'Contract',
				'CreateInput',
				'Fields',
				'Hooks',
				'Include',
				'Item',
				'Objects',
				'OrderBy',
				'Pointers',
				'Relations',
				'Select',
				'UpdateInput',
				'Where',
				'WhereFields',
			]) {
				this.#claim(`${alias}${suffix}`, `schema ${schema.className}`)
			}

			this.#schemas.set(schema, alias)
			this.#collectNamedFields(schema, schema.fields, alias)
		}
	}

	#claim(identifier: string, owner: string): void {
		const existing = this.#owners.get(identifier)

		if (existing !== undefined && existing !== owner) {
			throw new SchemaTypegenError(
				'generated-identity-conflict',
				`Generated identifier "${identifier}" from ${owner} conflicts with ${existing}`,
				{ owner, path: identifier },
			)
		}

		this.#owners.set(identifier, owner)
	}

	#fieldSignature(field: TypegenFieldSnapshot): string {
		const value =
			field.value.kind === 'object'
				? {
						fields: field.value.fields.map((child) =>
							this.#fieldSignature(child),
						),
						kind: field.value.kind,
					}
				: field.value.kind === 'enum'
					? { kind: field.value.kind, values: field.value.values }
					: field.value

		return JSON.stringify({
			inference: field.inference,
			kind: field.kind,
			name: field.name,
			value,
		})
	}

	#namedSignature(field: TypegenFieldSnapshot): string {
		if (field.value.kind === 'enum') {
			return JSON.stringify({ kind: 'enum', values: field.value.values })
		}

		if (field.value.kind === 'object') {
			return JSON.stringify({
				fields: field.value.fields.map((child) => this.#fieldSignature(child)),
				kind: 'object',
			})
		}

		throw new TypeError(
			`Field ${field.path.join('.')} has no generated named identity`,
		)
	}

	#reuseNamedDescriptor(
		base: string,
		field: TypegenFieldSnapshot,
		ownerPath: string,
	): EnumDescriptor | ObjectDescriptor | undefined {
		const existing = this.#namedIdentities.get(base)

		if (existing === undefined) {
			return undefined
		}

		if (existing.signature !== this.#namedSignature(field)) {
			throw new SchemaTypegenError(
				'generated-identity-conflict',
				`Generated identity "${base}" from ${ownerPath} conflicts with ${existing.descriptor.ownerPath}`,
				{ owner: ownerPath, path: base },
			)
		}

		return existing.descriptor
	}

	#rememberNamedDescriptor(
		base: string,
		field: TypegenFieldSnapshot,
		descriptor: EnumDescriptor | ObjectDescriptor,
	): void {
		this.#namedIdentities.set(
			base,
			immutableRecord({
				descriptor,
				signature: this.#namedSignature(field),
			}),
		)
	}

	#collectNamedFields(
		schema: TypegenSchemaSnapshot,
		fields: readonly TypegenFieldSnapshot[],
		schemaAlias: string,
	): void {
		for (const field of fields) {
			if (field.value.kind !== 'enum' && field.value.kind !== 'object') {
				continue
			}

			const ownerPath = `${schema.className}.${field.path.join('.')}`
			const explicitTypeName = field.value.typeName
			const base =
				explicitTypeName === undefined
					? `${schemaAlias}_${field.path.map(fieldIdentifier).join('_')}`
					: typeIdentifier(explicitTypeName)
			const reused =
				explicitTypeName === undefined
					? undefined
					: this.#reuseNamedDescriptor(base, field, ownerPath)

			if (field.value.kind === 'enum') {
				if (reused !== undefined) {
					const descriptor = reused

					this.#enumsByField.set(field, descriptor)
					continue
				}

				const alias = `${base}Enum`

				this.#claim(alias, ownerPath)

				const descriptor = immutableRecord({ alias, field, ownerPath, schema })

				this.#enumsByField.set(field, descriptor)
				this.#enums.push(descriptor)

				if (explicitTypeName !== undefined) {
					this.#rememberNamedDescriptor(base, field, descriptor)
				}

				continue
			}

			if (reused !== undefined) {
				const descriptor = reused

				this.#objectsByField.set(field, descriptor)
				this.#objectOccurrences.push(
					immutableRecord({ descriptor, field, schema }),
				)
				this.#collectNamedFields(schema, field.value.fields, schemaAlias)
				continue
			}

			const alias = `${base}Object`

			for (const suffix of ['CreateInput', 'Item', 'Paths', 'UpdateInput']) {
				this.#claim(`${alias}${suffix}`, ownerPath)
			}

			const descriptor = immutableRecord({ alias, field, ownerPath, schema })

			this.#objectsByField.set(field, descriptor)
			this.#objects.push(descriptor)
			this.#objectOccurrences.push(
				immutableRecord({ descriptor, field, schema }),
			)

			if (explicitTypeName !== undefined) {
				this.#rememberNamedDescriptor(base, field, descriptor)
			}

			this.#collectNamedFields(schema, field.value.fields, schemaAlias)
		}
	}

	enum(field: TypegenFieldSnapshot): EnumDescriptor {
		const descriptor = this.#enumsByField.get(field)

		if (descriptor === undefined) {
			throw new TypeError(`Missing enum identity for ${field.path.join('.')}`)
		}

		return descriptor
	}

	enumDefinitionsFor(schema: TypegenSchemaSnapshot): readonly EnumDescriptor[] {
		return this.#enums.filter((descriptor) => descriptor.schema === schema)
	}

	object(field: TypegenFieldSnapshot): ObjectDescriptor {
		const descriptor = this.#objectsByField.get(field)

		if (descriptor === undefined) {
			throw new TypeError(`Missing object identity for ${field.path.join('.')}`)
		}

		return descriptor
	}

	objectDefinitionsFor(
		schema: TypegenSchemaSnapshot,
	): readonly ObjectDescriptor[] {
		return this.#objects.filter((descriptor) => descriptor.schema === schema)
	}

	objectFieldsFor(schema: TypegenSchemaSnapshot): readonly ObjectOccurrence[] {
		return this.#objectOccurrences.filter(
			(occurrence) => occurrence.schema === schema,
		)
	}

	schema(schema: TypegenSchemaSnapshot): string {
		const alias = this.#schemas.get(schema)

		if (alias === undefined) {
			throw new TypeError(`Missing schema identity for ${schema.className}`)
		}

		return alias
	}
}

interface RenderContext {
	readonly identifiers: GeneratedIdentifiers
	readonly imports: ReferenceImports
	readonly schemasByName: ReadonlyMap<string, TypegenSchemaSnapshot>
}

const renderScalarValue = (
	field: TypegenFieldSnapshot,
	mode: FieldValueMode,
	context: RenderContext,
): string => {
	const value = field.value

	switch (value.kind) {
		case 'bigint':
			return 'bigint'
		case 'boolean':
			return 'boolean'
		case 'bytes':
			return 'Uint8Array'
		case 'enum':
			return context.identifiers.enum(field).alias
		case 'json':
			return 'JsonDocument'
		case 'number':
			return 'number'
		case 'plugin':
			return context.imports.alias(value.reference)
		case 'pointer':
			return mode === 'object'
				? `GeneratedPointerHandle<${quote(value.target)}>`
				: 'PointerValue'
		case 'relation':
			return 'never'
		case 'string':
			return 'string'
		case 'object': {
			const descriptor = context.identifiers.object(field)
			const objectMode =
				mode === 'update' && field.inference.list !== false ? 'create' : mode
			const suffix =
				objectMode === 'object'
					? 'Item'
					: objectMode === 'create'
						? 'CreateInput'
						: 'UpdateInput'

			return `${descriptor.alias}${suffix}`
		}
	}
}

const listDepth = (field: TypegenFieldSnapshot): number =>
	field.inference.list === true
		? 1
		: field.inference.list === false
			? 0
			: field.inference.list.length

const renderFieldValue = (
	field: TypegenFieldSnapshot,
	mode: FieldValueMode,
	context: RenderContext,
): string => {
	let rendered = renderScalarValue(field, mode, context)

	for (let index = 0; index < listDepth(field); index += 1) {
		rendered = `readonly (${rendered})[]`
	}

	return field.inference.nullable ? `${rendered} | null` : rendered
}

const renderProperties = (
	fields: readonly TypegenFieldSnapshot[],
	mode: FieldValueMode,
	context: RenderContext,
): string => {
	const properties = fields.flatMap((field) => {
		const presence = field.inference[mode]

		if (presence === 'forbidden') {
			return []
		}

		const optional = mode === 'object' || presence === 'required' ? '' : '?'

		return [
			`${renderDocumentation(field.description)}\treadonly ${quote(field.name)}${optional}: ${renderFieldValue(field, mode, context)}`,
		]
	})

	return properties.length === 0
		? 'Readonly<Record<never, never>>'
		: `Readonly<{\n${properties.join('\n')}\n}>`
}

const equalityKinds = new Set([
	'bigint',
	'binary',
	'boolean',
	'date',
	'dateTime',
	'decimal',
	'enum',
	'float',
	'int',
	'json',
	'pointer',
	'string',
	'time',
	'uuid',
])
const orderedKinds = new Set([
	'bigint',
	'date',
	'dateTime',
	'decimal',
	'float',
	'int',
	'string',
	'time',
])

const renderPathOperators = (
	field: TypegenFieldSnapshot,
	context: RenderContext,
): string => {
	const operators = ['GeneratedNullableWhere']

	if (listDepth(field) > 0) {
		return operators.join(' & ')
	}

	if (equalityKinds.has(field.kind) && field.kind !== 'pointer') {
		operators.unshift(
			`GeneratedEqualityWhere<${renderFieldValue(field, 'object', context)}>`,
		)
	}

	if (field.kind === 'string') {
		operators.push('GeneratedStringWhere<string>')
	}

	if (field.value.kind === 'json') {
		operators.push('GeneratedStructuralWhere<JsonDocument>')
	}

	if (field.value.kind === 'object') {
		const item = `${context.identifiers.object(field).alias}Item`

		operators.push(
			`GeneratedStructuralWhere<GeneratedDeepPartial<${item}>, Extract<keyof ${item}, string>>`,
		)
	}

	return operators.join(' & ')
}

const pathTuple = (path: readonly string[]): string =>
	`readonly [${path.map(quote).join(', ')}]`

const collectObjectPathTypes = (
	fields: readonly TypegenFieldSnapshot[],
	parentPath: readonly string[],
	context: RenderContext,
): readonly string[] =>
	fields.flatMap((field) => {
		const path = [...parentPath, field.name]
		const own = `GeneratedPathWhere<${pathTuple(path)}, ${renderPathOperators(field, context)}>`

		if (listDepth(field) > 0) {
			return [own]
		}

		if (field.value.kind === 'object') {
			return [own, ...collectObjectPathTypes(field.value.fields, path, context)]
		}

		if (field.value.kind === 'json') {
			return [
				own,
				`GeneratedJsonPathWhere<readonly [${path.map(quote).join(', ')}, string, ...string[]]>`,
			]
		}

		return [own]
	})

const renderRootWhere = (
	field: TypegenFieldSnapshot,
	context: RenderContext,
): string => {
	if (field.value.kind === 'relation') {
		const target = context.schemasByName.get(field.value.target)

		if (target === undefined) {
			throw new TypeError(
				`Unknown generated relation target ${field.value.target}`,
			)
		}

		return `GeneratedRelationWhere<${context.identifiers.schema(target)}Where>`
	}

	if (field.value.kind === 'pointer') {
		const target = context.schemasByName.get(field.value.target)

		if (target === undefined) {
			throw new TypeError(
				`Unknown generated pointer target ${field.value.target}`,
			)
		}

		return `GeneratedPointerWhere<${context.identifiers.schema(target)}Where> & GeneratedNullableWhere`
	}

	const operators = ['GeneratedNullableWhere']

	if (listDepth(field) > 0) {
		return operators.join(' & ')
	}

	if (equalityKinds.has(field.kind)) {
		operators.unshift(
			`GeneratedEqualityWhere<${renderFieldValue(field, 'object', context)}>`,
		)
	}

	if (orderedKinds.has(field.kind)) {
		operators.push(
			`GeneratedOrderedWhere<${renderScalarValue(field, 'object', context)}>`,
		)
	}

	if (field.kind === 'string') {
		operators.push('GeneratedStringWhere<string>')
	}

	if (field.value.kind === 'json') {
		operators.push(
			'GeneratedStructuralWhere<JsonDocument>',
			'Readonly<{ readonly at?: readonly GeneratedJsonPathWhere[] }>',
		)
	}

	if (field.value.kind === 'object') {
		const descriptor = context.identifiers.object(field)

		operators.push(
			`GeneratedStructuralWhere<GeneratedDeepPartial<${descriptor.alias}Item>, Extract<keyof ${descriptor.alias}Item, string>>`,
			`Readonly<{ readonly at?: readonly ${descriptor.alias}Paths[] }>`,
		)
	}

	return operators.join(' & ')
}

const renderWhere = (
	schema: TypegenSchemaSnapshot,
	alias: string,
	context: RenderContext,
): string => {
	const properties = schema.fields.map(
		(field) =>
			`\treadonly ${quote(field.name)}?: ${renderRootWhere(field, context)}`,
	)

	return `export interface ${alias}WhereFields {\n${properties.join('\n')}\n}\n\nexport interface ${alias}Where extends ${alias}WhereFields, GeneratedWhereBranches<${alias}Where> {}`
}

const renderObject = (
	descriptor: ObjectDescriptor,
	context: RenderContext,
): string => {
	if (descriptor.field.value.kind !== 'object') {
		throw new TypeError(
			`Generated object ${descriptor.ownerPath} is not an object`,
		)
	}

	const paths = collectObjectPathTypes(
		descriptor.field.value.fields,
		[],
		context,
	)

	return [
		`export type ${descriptor.alias}Item = ${renderProperties(descriptor.field.value.fields, 'object', context)}`,
		`export type ${descriptor.alias}CreateInput = ${renderProperties(descriptor.field.value.fields, 'create', context)}`,
		`export type ${descriptor.alias}UpdateInput = ${renderProperties(descriptor.field.value.fields, 'update', context)}`,
		`export type ${descriptor.alias}Paths = ${renderUnion(paths)}`,
	].join('\n\n')
}

const renderEnum = (descriptor: EnumDescriptor): string => {
	if (descriptor.field.value.kind !== 'enum') {
		throw new TypeError(`Generated enum ${descriptor.ownerPath} is not an enum`)
	}

	return `export type ${descriptor.alias} = ${renderUnion(
		descriptor.field.value.values.map(quote),
	)}`
}

const renderRelationships = (
	schema: TypegenSchemaSnapshot,
	kind: 'pointer' | 'relation',
): string => {
	const properties = schema.fields.flatMap((field) => {
		if (field.value.kind !== kind) {
			return []
		}

		const cardinality = kind === 'pointer' ? 'one' : 'many'

		return [
			`\treadonly ${quote(field.name)}: GeneratedRelationshipContract<${quote(field.value.target)}, ${quote(cardinality)}>`,
		]
	})

	return properties.length === 0
		? 'Readonly<Record<never, never>>'
		: `Readonly<{\n${properties.join('\n')}\n}>`
}

const renderInclude = (
	schema: TypegenSchemaSnapshot,
	context: RenderContext,
): string => {
	const properties = schema.fields.flatMap((field) => {
		if (field.value.kind !== 'pointer' && field.value.kind !== 'relation') {
			return []
		}

		const target = context.schemasByName.get(field.value.target)

		if (target === undefined) {
			throw new TypeError(
				`Unknown generated include target ${field.value.target}`,
			)
		}

		const targetAlias = context.identifiers.schema(target)
		const include =
			field.value.kind === 'pointer'
				? `GeneratedPointerInclude<${targetAlias}Select, ${targetAlias}Include>`
				: `GeneratedRelationInclude<${targetAlias}Where, ${targetAlias}Select, ${targetAlias}OrderBy, ${targetAlias}Include>`

		return [`\treadonly ${quote(field.name)}?: ${include}`]
	})

	return properties.length === 0
		? 'Readonly<Record<never, never>>'
		: `Readonly<{\n${properties.join('\n')}\n}>`
}

const renderFieldContracts = (
	schema: TypegenSchemaSnapshot,
	context: RenderContext,
): string => {
	const properties = schema.fields.map((field) => {
		const objectValue =
			field.inference.object === 'forbidden'
				? 'never'
				: renderFieldValue(field, 'object', context)
		const createValue =
			field.inference.create === 'forbidden'
				? 'never'
				: renderFieldValue(field, 'create', context)
		const updateValue =
			field.inference.update === 'forbidden'
				? 'never'
				: renderFieldValue(field, 'update', context)
		const paths =
			field.value.kind === 'object'
				? `${context.identifiers.object(field).alias}Paths`
				: field.value.kind === 'json'
					? 'GeneratedJsonPathWhere'
					: 'never'
		const list =
			field.inference.list === false
				? 'false'
				: field.inference.list === true
					? 'true'
					: `readonly [${field.inference.list.map(() => 'true').join(', ')}]`

		return `\treadonly ${quote(field.name)}: GeneratedFieldContract<${objectValue}, ${createValue}, ${updateValue}, ${renderRootWhere(field, context)}, ${paths}, ${quote(field.kind)}, ${list}>`
	})

	return `Readonly<{\n${properties.join('\n')}\n}>`
}

const renderObjectContracts = (
	schema: TypegenSchemaSnapshot,
	context: RenderContext,
): string => {
	const objects = context.identifiers.objectFieldsFor(schema)

	if (objects.length === 0) {
		return 'Readonly<Record<never, never>>'
	}

	return `Readonly<{\n${objects
		.map(
			({ descriptor, field }) =>
				`\treadonly ${quote(field.path.join('.'))}: GeneratedObjectContract<${descriptor.alias}Item, ${descriptor.alias}CreateInput, ${descriptor.alias}UpdateInput, ${descriptor.alias}Paths>`,
		)
		.join('\n')}\n}>`
}

const renderSchema = (
	schema: TypegenSchemaSnapshot,
	context: RenderContext,
): string => {
	const alias = context.identifiers.schema(schema)
	const fieldNames = renderUnion(schema.fields.map(({ name }) => quote(name)))
	const selectableFieldNames = renderUnion(
		schema.fields
			.filter(({ inference }) => inference.object !== 'forbidden')
			.map(({ name }) => quote(name)),
	)
	const sections = [
		...context.identifiers
			.enumDefinitionsFor(schema)
			.map((descriptor) => renderEnum(descriptor)),
		...context.identifiers
			.objectDefinitionsFor(schema)
			.map((descriptor) => renderObject(descriptor, context)),
	]

	sections.push(
		`export type ${alias}Item = ${renderProperties(schema.fields, 'object', context)}`,
		`export type ${alias}CreateInput = ${renderProperties(schema.fields, 'create', context)}`,
		`export type ${alias}UpdateInput = ${renderProperties(schema.fields, 'update', context)}`,
		renderWhere(schema, alias, context),
		`export type ${alias}Select = GeneratedSelect<${selectableFieldNames}>`,
		`export type ${alias}OrderBy = GeneratedOrderBy<${fieldNames}>`,
		`export type ${alias}Include = ${renderInclude(schema, context)}`,
		`export type ${alias}Fields = ${renderFieldContracts(schema, context)}`,
		`export type ${alias}Objects = ${renderObjectContracts(schema, context)}`,
		`export type ${alias}Pointers = ${renderRelationships(schema, 'pointer')}`,
		`export type ${alias}Relations = ${renderRelationships(schema, 'relation')}`,
		`export type ${alias}Access = GeneratedSchemaAccessContract<${alias}Item, ${alias}CreateInput, ${alias}UpdateInput, ${alias}Where, ${alias}OrderBy>`,
		`export type ${alias}Hooks = GeneratedSchemaHookContract<${alias}Item, ${alias}CreateInput, ${alias}UpdateInput>`,
		`export interface ${alias}Contract {\n\treadonly Access: ${alias}Access\n\treadonly Create: ${alias}CreateInput\n\treadonly FieldBuilder: ApplicationFieldBuilder\n\treadonly Fields: ${alias}Fields\n\treadonly Hooks: ${alias}Hooks\n\treadonly Include: ${alias}Include\n\treadonly Item: ${alias}Item\n\treadonly Objects: ${alias}Objects\n\treadonly OrderBy: ${alias}OrderBy\n\treadonly Pointers: ${alias}Pointers\n\treadonly Relations: ${alias}Relations\n\treadonly Select: ${alias}Select\n\treadonly Update: ${alias}UpdateInput\n\treadonly Where: ${alias}Where\n}`,
	)

	return sections.join('\n\n')
}

const coreImports = [
	'EmbeddedFieldBuilder',
	'FieldBuilder',
	'GeneratedDeepPartial',
	'GeneratedEqualityWhere',
	'GeneratedFieldContract',
	'GeneratedJsonPathWhere',
	'GeneratedNullableWhere',
	'GeneratedObjectContract',
	'GeneratedOrderBy',
	'GeneratedOrderedWhere',
	'GeneratedPathWhere',
	'GeneratedPointerHandle',
	'GeneratedPointerInclude',
	'GeneratedPointerWhere',
	'GeneratedRelationInclude',
	'GeneratedRelationshipContract',
	'GeneratedRelationWhere',
	'GeneratedSchemaAccessContract',
	'GeneratedSchemaHookContract',
	'GeneratedSelect',
	'GeneratedStringWhere',
	'GeneratedStructuralWhere',
	'GeneratedWhereBranches',
	'JsonDocument',
	'PointerValue',
	'UltimaBaseGeneratedSchemas as CoreGeneratedSchemas',
] as const

const renderFieldBuilder = (
	snapshot: TypegenApplicationSnapshot,
	imports: ReferenceImports,
): string => {
	const methods = snapshot.fieldMethods.map(
		(method) =>
			`\treadonly ${quote(method.name)}: ${imports.alias(method.method)}`,
	)
	const extension =
		methods.length === 0
			? 'Readonly<Record<never, never>>'
			: `{\n${methods.join('\n')}\n}`

	return [
		`export type ApplicationFieldBuilder = FieldBuilder & ${extension}`,
		`export type ApplicationEmbeddedFieldBuilder = EmbeddedFieldBuilder & ${extension}`,
	].join('\n')
}

const renderRegistry = (
	snapshot: TypegenApplicationSnapshot,
	context: RenderContext,
	fingerprint: string,
): string => {
	const schemas = snapshot.schemas.map(
		(schema) =>
			`\treadonly ${quote(schema.className)}: ${context.identifiers.schema(schema)}Contract`,
	)

	const fieldMethods = snapshot.fieldMethods.map(
		(method) =>
			`\t\treadonly ${quote(method.name)}: ${context.imports.alias(method.method)}`,
	)
	const renderedFieldMethods = fieldMethods.join('\n')

	return `declare module '@ultimabase/core' {\n\tinterface UltimaBaseGeneratedRegistryState {\n\t\treadonly application: true\n\t}\n\tinterface UltimaBaseGeneratedSchemas {\n${schemas.map((schema) => `\t${schema}`).join('\n')}\n\t}\n\tinterface UltimaBaseGeneratedFieldBuilderMethods {\n${renderedFieldMethods}\n\t}\n\tinterface UltimaBaseGeneratedEmbeddedFieldBuilderMethods {\n${renderedFieldMethods}\n\t}\n}\n\nexport type UltimaBaseGeneratedSchemas = CoreGeneratedSchemas\n\nexport interface UltimaBaseGeneratedApplication {\n\treadonly FieldBuilder: ApplicationFieldBuilder\n\treadonly fingerprint: ${quote(fingerprint)}\n\treadonly schemas: CoreGeneratedSchemas\n}\n\nexport declare const ultimaBaseGeneratedFingerprint: ${quote(fingerprint)}`
}

const fingerprintSnapshot = (snapshot: TypegenApplicationSnapshot): string =>
	createHash('sha256')
		.update(
			JSON.stringify({
				coreContractVersion: generatedApplicationContractVersion,
				generatorVersion,
				snapshot,
			}),
		)
		.digest('hex')

export interface GeneratedApplicationTypes {
	/** Complete deterministic TypeScript declaration ready for atomic output. */
	readonly contents: string
	/** SHA-256 identity of the generator, Core ABI, and static application graph. */
	readonly fingerprint: string
	/** Immutable callback-free logical input used to produce the declaration. */
	readonly snapshot: TypegenApplicationSnapshot
}

export interface GenerateApplicationTypesOptions {
	/** Compiles the exact application schema graph without running plugin setup. */
	readonly application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>
	/** Isolates fingerprints and generated registries owned by different applications. */
	readonly applicationId: string
}

/** Emits one deterministic, callback-free application declaration registry. */
export const generateApplicationTypes = (
	options: GenerateApplicationTypesOptions,
): GeneratedApplicationTypes => {
	const snapshot = createTypegenSnapshot(
		options.application,
		options.applicationId,
	)
	const fingerprint = fingerprintSnapshot(snapshot)
	const imports = new ReferenceImports(snapshot)
	const identifiers = new GeneratedIdentifiers(snapshot)
	const schemasByName = new Map(
		snapshot.schemas.map((schema) => [schema.className, schema]),
	)
	const context: RenderContext = { identifiers, imports, schemasByName }
	const pluginImports = imports.render()
	const sections = [
		`// Generated by @ultimabase/codegen. Do not edit.\n// @ultimabase/schema-fingerprint sha256:${fingerprint}`,
		`import type {\n${coreImports.map((name) => `\t${name},`).join('\n')}\n} from '@ultimabase/core'`,
		pluginImports,
		renderFieldBuilder(snapshot, imports),
		...snapshot.schemas.map((schema) => renderSchema(schema, context)),
		renderRegistry(snapshot, context, fingerprint),
	].filter((section) => section !== '')
	const contents = `${sections.join('\n\n')}\n`

	return immutableRecord({ contents, fingerprint, snapshot })
}
