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

const generatorVersion = 6
const quote = (value: string): string => JSON.stringify(value)
const propertyName = (value: string): string =>
	/^[$A-Z_a-z][$0-9A-Z_a-z]*$/u.test(value) ? value : quote(value)
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
				'CreateInput',
				'Hooks',
				'Include',
				'Item',
				'OrderByInput',
				'Select',
				'TypeInfo',
				'UpdateInput',
				'WhereInput',
			]) {
				this.#claim(`${alias}${suffix}`, `schema ${schema.className}`)
			}

			for (const suffix of [
				'Contract',
				'Fields',
				'Objects',
				'Pointers',
				'Relations',
			]) {
				this.#claim(`__${alias}${suffix}`, `schema ${schema.className}`)
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
					? `${schemaAlias}${field.path.map(fieldIdentifier).join('')}`
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

				const alias = base

				this.#claim(alias, ownerPath)
				this.#claim(`${alias}Filter`, ownerPath)

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

			const alias = base

			this.#claim(alias, ownerPath)

			for (const suffix of [
				'CreateInput',
				'Filter',
				'PathFilter',
				'PathValueFilter',
				'UpdateInput',
			]) {
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
				? `Core.GeneratedPointerHandle<${quote(value.target)}>`
				: 'Core.PointerValue'
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
					? ''
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
		rendered = `ReadonlyArray<${rendered}>`
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
			`${renderDocumentation(field.description)}\treadonly ${propertyName(field.name)}${optional}: ${renderFieldValue(field, mode, context)}`,
		]
	})

	return properties.length === 0
		? 'Record<never, never>'
		: `{\n${properties.join('\n')}\n}`
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

const renderEqualityProperties = (value: string): string =>
	`\treadonly eq?: ${value}
\treadonly in?: ReadonlyArray<${value}>
\treadonly ne?: ${value}
\treadonly notIn?: ReadonlyArray<${value}>`

const renderOrderedProperties = (value: string): string =>
	`\treadonly between?: { readonly lower: ${value}; readonly upper: ${value} }
\treadonly gt?: ${value}
\treadonly gte?: ${value}
\treadonly lt?: ${value}
\treadonly lte?: ${value}
\treadonly notBetween?: { readonly lower: ${value}; readonly upper: ${value} }`

const nullProperties = `\treadonly isNotNull?: true
\treadonly isNull?: true`

const renderStructuralProperties = (value: string, key: string): string =>
	`\treadonly containedBy?: ${value}
\treadonly contains?: ${value}
\treadonly hasAllKeys?: ReadonlyArray<${key}>
\treadonly hasAnyKeys?: ReadonlyArray<${key}>
\treadonly hasKey?: ${key}
\treadonly jsonPathExists?: JsonPathExpression
\treadonly jsonPathMatches?: JsonPathExpression`

const renderNamedFilter = (
	name: string,
	properties: readonly string[],
): string => `export type ${name} = {\n${properties.join('\n')}\n}`

const renderPathOperators = (
	field: TypegenFieldSnapshot,
	context: RenderContext,
): string => {
	if (listDepth(field) > 0) {
		return 'NullFilter'
	}

	if (field.kind === 'string') {
		return 'StringPathFilter'
	}

	if (field.value.kind === 'json') {
		return 'JsonPathValueFilter'
	}

	if (field.value.kind === 'object') {
		const item = context.identifiers.object(field).alias

		return `${item}PathValueFilter`
	}

	if (field.value.kind === 'enum') {
		return `${context.identifiers.enum(field).alias}Filter`
	}

	const pathFilter = new Map([
		['bigint', 'BigIntPathFilter'],
		['binary', 'BinaryPathFilter'],
		['boolean', 'BooleanPathFilter'],
		['date', 'DateTimePathFilter'],
		['dateTime', 'DateTimePathFilter'],
		['decimal', 'DecimalPathFilter'],
		['float', 'FloatPathFilter'],
		['int', 'IntPathFilter'],
		['time', 'DateTimePathFilter'],
		['uuid', 'IDPathFilter'],
	]).get(field.kind)

	return pathFilter ?? 'NullFilter'
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
		const own = `Readonly<{ readonly path: ${pathTuple(path)} } & ${renderPathOperators(field, context)}>`

		if (listDepth(field) > 0) {
			return [own]
		}

		if (field.value.kind === 'object') {
			return [own, ...collectObjectPathTypes(field.value.fields, path, context)]
		}

		if (field.value.kind === 'json') {
			return [
				own,
				`JsonPathFilter<readonly [${path.map(quote).join(', ')}, string, ...string[]]>`,
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

		return `RelationFilter<${context.identifiers.schema(target)}WhereInput>`
	}

	if (field.value.kind === 'pointer') {
		const target = context.schemasByName.get(field.value.target)

		if (target === undefined) {
			throw new TypeError(
				`Unknown generated pointer target ${field.value.target}`,
			)
		}

		return `PointerFilter<${context.identifiers.schema(target)}WhereInput>`
	}

	if (listDepth(field) > 0) {
		return 'NullFilter'
	}

	if (field.kind === 'string') {
		return 'StringFilter'
	}

	if (field.kind === 'boolean') {
		return 'BooleanFilter'
	}

	if (field.kind === 'uuid') {
		return 'IDFilter'
	}

	if (
		field.kind === 'date' ||
		field.kind === 'dateTime' ||
		field.kind === 'time'
	) {
		return 'DateTimeFilter'
	}

	if (field.value.kind === 'enum') {
		return `${context.identifiers.enum(field).alias}Filter`
	}

	if (field.value.kind === 'json') {
		return 'JsonFilter'
	}

	if (field.value.kind === 'object') {
		const descriptor = context.identifiers.object(field)

		return `${descriptor.alias}Filter`
	}

	return (
		new Map([
			['bigint', 'BigIntFilter'],
			['binary', 'BinaryFilter'],
			['decimal', 'DecimalFilter'],
			['float', 'FloatFilter'],
			['int', 'IntFilter'],
		]).get(field.kind) ?? 'NullFilter'
	)
}

const renderWhere = (
	schema: TypegenSchemaSnapshot,
	alias: string,
	context: RenderContext,
): string => {
	const properties = schema.fields.map(
		(field) =>
			`\treadonly ${propertyName(field.name)}?: ${renderRootWhere(field, context)}`,
	)

	return `export type ${alias}WhereInput = {\n\treadonly AND?: ReadonlyArray<${alias}WhereInput>\n\treadonly OR?: ReadonlyArray<${alias}WhereInput>\n\treadonly NOT?: ${alias}WhereInput\n${properties.join('\n')}\n}`
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
		`export type ${descriptor.alias} = ${renderProperties(descriptor.field.value.fields, 'object', context)}`,
		`export type ${descriptor.alias}CreateInput = ${renderProperties(descriptor.field.value.fields, 'create', context)}`,
		`export type ${descriptor.alias}UpdateInput = ${renderProperties(descriptor.field.value.fields, 'update', context)}`,
		`export type ${descriptor.alias}PathFilter = ${renderUnion(paths)}`,
		renderNamedFilter(`${descriptor.alias}PathValueFilter`, [
			nullProperties,
			renderStructuralProperties(
				`${descriptor.alias}UpdateInput | null`,
				`Extract<keyof ${descriptor.alias}, string>`,
			),
		]),
		renderNamedFilter(`${descriptor.alias}Filter`, [
			nullProperties,
			renderStructuralProperties(
				`${descriptor.alias}UpdateInput | null`,
				`Extract<keyof ${descriptor.alias}, string>`,
			),
			`\treadonly at?: ReadonlyArray<${descriptor.alias}PathFilter>`,
		]),
	].join('\n\n')
}

const renderEnum = (descriptor: EnumDescriptor): string => {
	if (descriptor.field.value.kind !== 'enum') {
		throw new TypeError(`Generated enum ${descriptor.ownerPath} is not an enum`)
	}

	return `export type ${descriptor.alias} = ${renderUnion(
		descriptor.field.value.values.map(quote),
	)}\n\n${renderNamedFilter(`${descriptor.alias}Filter`, [
		renderEqualityProperties(`${descriptor.alias} | null`),
		nullProperties,
	])}`
}

const hasRelationships = (schema: TypegenSchemaSnapshot): boolean =>
	schema.fields.some(
		({ value }) => value.kind === 'pointer' || value.kind === 'relation',
	)

const includeType = (
	schema: TypegenSchemaSnapshot,
	context: RenderContext,
): string =>
	hasRelationships(schema)
		? `${context.identifiers.schema(schema)}Include`
		: 'never'

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
				? `{ readonly include?: ${includeType(target, context)}; readonly select?: ${targetAlias}Select }`
				: `{ readonly include?: ${includeType(target, context)}; readonly limit?: number; readonly offset?: number; readonly orderBy?: ${targetAlias}OrderByInput; readonly select?: ${targetAlias}Select; readonly where?: ${targetAlias}WhereInput }`

		return [`\treadonly ${propertyName(field.name)}?: ${include}`]
	})

	return properties.length === 0 ? 'never' : `{\n${properties.join('\n')}\n}`
}

const renderSelect = (schema: TypegenSchemaSnapshot): string => {
	const properties = schema.fields.flatMap((field) =>
		field.inference.object === 'forbidden'
			? []
			: [
					`${renderDocumentation(field.description)}\treadonly ${propertyName(field.name)}?: boolean`,
				],
	)

	return `{\n${properties.join('\n')}\n}`
}

const renderOrderBy = (schema: TypegenSchemaSnapshot): string => {
	const properties = schema.fields.map(
		(field) => `\treadonly ${propertyName(field.name)}?: OrderDirection | null`,
	)

	return `{\n${properties.join('\n')}\n}`
}

const renderSchemaPublic = (
	schema: TypegenSchemaSnapshot,
	context: RenderContext,
): string => {
	const alias = context.identifiers.schema(schema)
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
		`export type ${alias}Select = ${renderSelect(schema)}`,
		`export type ${alias}OrderByInput = ${renderOrderBy(schema)}`,
		`export type ${alias}Access = {\n\treadonly create: ${alias}CreateInput\n\treadonly item: ${alias}Item\n\treadonly orderBy: ${alias}OrderByInput\n\treadonly update: ${alias}UpdateInput\n\treadonly where: ${alias}WhereInput\n}`,
		`export type ${alias}Hooks = {\n\treadonly create: ${alias}CreateInput\n\treadonly item: ${alias}Item\n\treadonly originalItem: ${alias}Item\n\treadonly update: ${alias}UpdateInput\n}`,
	)

	if (hasRelationships(schema)) {
		sections.splice(
			sections.length - 2,
			0,
			`export type ${alias}Include = ${renderInclude(schema, context)}`,
		)
	}

	return sections.join('\n\n')
}

const collectNestedFields = (
	fields: readonly TypegenFieldSnapshot[],
): readonly TypegenFieldSnapshot[] =>
	fields.flatMap((field) => [
		field,
		...(field.value.kind === 'object'
			? collectNestedFields(field.value.fields)
			: []),
	])

const renderSharedTypes = (snapshot: TypegenApplicationSnapshot): string => {
	const rootFields = snapshot.schemas.flatMap(({ fields }) => fields)
	const nestedFields = snapshot.schemas.flatMap(({ fields }) =>
		fields.flatMap((field) =>
			field.value.kind === 'object'
				? collectNestedFields(field.value.fields)
				: [],
		),
	)
	const allFields = [...rootFields, ...nestedFields]
	const definitions: string[] = [`export type OrderDirection = "asc" | "desc"`]
	const hasRootKind = (kind: string): boolean =>
		rootFields.some((field) => field.kind === kind && listDepth(field) === 0)
	const hasNestedKind = (kind: string): boolean =>
		nestedFields.some((field) => field.kind === kind && listDepth(field) === 0)

	if (
		allFields.some(
			(field) =>
				listDepth(field) > 0 ||
				(!equalityKinds.has(field.kind) &&
					field.value.kind !== 'object' &&
					field.value.kind !== 'relation'),
		)
	) {
		definitions.push(renderNamedFilter('NullFilter', [nullProperties]))
	}

	const scalarFilters = [
		{ kind: 'bigint', name: 'BigIntFilter', value: 'bigint | null' },
		{ kind: 'binary', name: 'BinaryFilter', value: 'Uint8Array | null' },
		{ kind: 'decimal', name: 'DecimalFilter', value: 'string | null' },
		{ kind: 'float', name: 'FloatFilter', value: 'number | null' },
		{ kind: 'int', name: 'IntFilter', value: 'number | null' },
	] as const

	for (const { kind, name, value } of scalarFilters) {
		if (hasRootKind(kind)) {
			definitions.push(
				renderNamedFilter(name, [
					renderEqualityProperties(value),
					...(orderedKinds.has(kind) ? [renderOrderedProperties(value)] : []),
					nullProperties,
				]),
			)
		}

		if (hasNestedKind(kind)) {
			definitions.push(
				renderNamedFilter(name.replace('Filter', 'PathFilter'), [
					renderEqualityProperties(value),
					nullProperties,
				]),
			)
		}
	}

	const equalityPathFilters = [
		{ kind: 'boolean', name: 'BooleanPathFilter', value: 'boolean | null' },
		{ kind: 'date', name: 'DateTimePathFilter', value: 'string | null' },
		{ kind: 'dateTime', name: 'DateTimePathFilter', value: 'string | null' },
		{ kind: 'time', name: 'DateTimePathFilter', value: 'string | null' },
		{ kind: 'uuid', name: 'IDPathFilter', value: 'string | null' },
	] as const
	const emittedPathFilters = new Set<string>()

	for (const { kind, name, value } of equalityPathFilters) {
		if (hasNestedKind(kind) && !emittedPathFilters.has(name)) {
			emittedPathFilters.add(name)
			definitions.push(
				renderNamedFilter(name, [
					renderEqualityProperties(value),
					nullProperties,
				]),
			)
		}
	}

	if (hasRootKind('string') || hasNestedKind('string')) {
		definitions.push(
			`export type RegexFlag = "case-insensitive" | "dot-matches-newline" | "multiline"`,
			renderNamedFilter('RegexPattern', [
				'\treadonly source: string',
				'\treadonly flags: ReadonlyArray<RegexFlag>',
			]),
		)
	}

	if (hasNestedKind('string')) {
		definitions.push(
			renderNamedFilter('StringPathFilter', [
				renderEqualityProperties('string | null'),
				'\treadonly contains?: string | null',
				'\treadonly endsWith?: string | null',
				'\treadonly matches?: RegexPattern',
				'\treadonly startsWith?: string | null',
				nullProperties,
			]),
		)
	}

	if (hasRootKind('string')) {
		definitions.push(
			renderNamedFilter('StringFilter', [
				renderEqualityProperties('string | null'),
				renderOrderedProperties('string | null'),
				'\treadonly contains?: string | null',
				'\treadonly endsWith?: string | null',
				'\treadonly matches?: RegexPattern',
				'\treadonly startsWith?: string | null',
				nullProperties,
			]),
		)
	}

	if (hasRootKind('boolean')) {
		definitions.push(
			renderNamedFilter('BooleanFilter', [
				renderEqualityProperties('boolean | null'),
				nullProperties,
			]),
		)
	}

	if (hasRootKind('uuid')) {
		definitions.push(
			renderNamedFilter('IDFilter', [
				renderEqualityProperties('string | null'),
				nullProperties,
			]),
		)
	}

	if (hasRootKind('date') || hasRootKind('dateTime') || hasRootKind('time')) {
		definitions.push(
			renderNamedFilter('DateTimeFilter', [
				renderEqualityProperties('string | null'),
				renderOrderedProperties('string | null'),
				nullProperties,
			]),
		)
	}

	const hasJsonField = allFields.some(({ value }) => value.kind === 'json')
	const hasObjectField = allFields.some(({ value }) => value.kind === 'object')

	if (hasJsonField || hasObjectField) {
		definitions.push(
			`export type JsonValue = boolean | number | string | null | JsonObject | ReadonlyArray<JsonValue>`,
			`export type JsonObject = { readonly [key: string]: JsonValue }`,
			renderNamedFilter('JsonPathExpression', [
				'\treadonly source: string',
				'\treadonly variables?: JsonObject',
			]),
		)
	}

	if (hasJsonField) {
		definitions.push(
			`export type JsonDocument = JsonObject`,
			renderNamedFilter(
				'JsonPathFilter<TPath extends readonly [string, ...string[]] = readonly [string, ...string[]]>',
				[
					'\treadonly path: TPath',
					renderEqualityProperties('JsonValue'),
					renderStructuralProperties('JsonValue', 'string'),
					nullProperties,
				],
			),
		)
	}

	if (rootFields.some(({ value }) => value.kind === 'json')) {
		definitions.push(
			renderNamedFilter('JsonFilter', [
				renderEqualityProperties('JsonDocument | null'),
				renderStructuralProperties('JsonDocument | null', 'string'),
				nullProperties,
				'\treadonly at?: ReadonlyArray<JsonPathFilter>',
			]),
		)
	}

	if (nestedFields.some(({ value }) => value.kind === 'json')) {
		definitions.push(
			renderNamedFilter('JsonPathValueFilter', [
				renderEqualityProperties('JsonDocument | null'),
				renderStructuralProperties('JsonDocument | null', 'string'),
				nullProperties,
			]),
		)
	}

	if (rootFields.some(({ value }) => value.kind === 'pointer')) {
		definitions.push(
			renderNamedFilter('PointerFilter<TWhere>', [
				renderEqualityProperties('string | null'),
				'\treadonly is?: TWhere',
				'\treadonly isNot?: TWhere',
				nullProperties,
			]),
		)
	}

	if (rootFields.some(({ value }) => value.kind === 'relation')) {
		definitions.push(
			renderNamedFilter('RelationFilter<TWhere>', [
				`\treadonly count?: {
${renderEqualityProperties('number | null').replaceAll('\t', '\t\t')}
${renderOrderedProperties('number | null').replaceAll('\t', '\t\t')}
\t\treadonly where?: TWhere
\t}`,
				'\treadonly every?: TWhere',
				'\treadonly isEmpty?: true',
				'\treadonly isNotEmpty?: true',
				'\treadonly none?: TWhere',
				'\treadonly some?: TWhere',
			]),
		)
	}

	return definitions.join('\n\n')
}

const renderFieldBuilder = (
	snapshot: TypegenApplicationSnapshot,
	imports: ReferenceImports,
): string => {
	const methods = snapshot.fieldMethods.map(
		(method) =>
			`\treadonly ${propertyName(method.name)}: ${imports.alias(method.method)}`,
	)

	if (methods.length === 0) {
		return ''
	}

	return [
		`export type ApplicationFieldBuilder = Core.FieldBuilder & {\n${methods.join('\n')}\n}`,
		`export type ApplicationEmbeddedFieldBuilder = Core.EmbeddedFieldBuilder & {\n${methods.join('\n')}\n}`,
	].join('\n')
}

const renderTypeInfo = (
	snapshot: TypegenApplicationSnapshot,
	context: RenderContext,
): string => {
	const schemas = snapshot.schemas.map((schema) => {
		const alias = context.identifiers.schema(schema)
		const fields = renderUnion(schema.fields.map(({ name }) => quote(name)))
		const relationships = schema.fields.flatMap((field) =>
			field.value.kind === 'pointer' || field.value.kind === 'relation'
				? [
						`\t\t\t\treadonly ${propertyName(field.name)}: ${quote(field.value.target)}`,
					]
				: [],
		)
		const relationshipMap =
			relationships.length === 0
				? ''
				: `\t\t\treadonly relationships: {\n${relationships.join('\n')}\n\t\t\t}\n`
		const include = hasRelationships(schema)
			? `\t\t\t\treadonly include: ${alias}Include\n`
			: ''

		return `\texport namespace ${alias} {
\t\texport type Item = ${alias}Item
\t\texport type TypeInfo = {
\t\t\treadonly key: ${quote(schema.className)}
\t\t\treadonly fields: ${fields}
\t\t\treadonly item: Item
${relationshipMap}\t\t\treadonly inputs: {
\t\t\t\treadonly create: ${alias}CreateInput
${include}\t\t\t\treadonly orderBy: ${alias}OrderByInput
\t\t\t\treadonly select: ${alias}Select
\t\t\t\treadonly update: ${alias}UpdateInput
\t\t\t\treadonly where: ${alias}WhereInput
\t\t\t}
\t\t}
\t}`
	})
	const registry = snapshot.schemas.map(
		(schema) =>
			`\t\treadonly ${quote(schema.className)}: Schemas.${context.identifiers.schema(schema)}.TypeInfo`,
	)

	return `export declare namespace Schemas {
${schemas.join('\n')}
}

export type TypeInfo = {
\treadonly schemas: {
${registry.join('\n')}
\t}
}`
}

const renderRegistry = (
	snapshot: TypegenApplicationSnapshot,
	context: RenderContext,
): string => {
	const schemas = snapshot.schemas.map(
		(schema) =>
			`\t\treadonly ${quote(schema.className)}: Schemas.${context.identifiers.schema(schema)}.TypeInfo`,
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

/** Renders one previously validated static snapshot without touching application state. */
export const generateApplicationTypesFromSnapshot = (
	snapshot: TypegenApplicationSnapshot,
): GeneratedApplicationTypes => {
	const fingerprint = fingerprintSnapshot(snapshot)
	const imports = new ReferenceImports(snapshot)
	const identifiers = new GeneratedIdentifiers(snapshot)
	const schemasByName = new Map(
		snapshot.schemas.map((schema) => [schema.className, schema]),
	)
	const context: RenderContext = { identifiers, imports, schemasByName }
	const generatedSections = [
		...snapshot.schemas.map((schema) => renderSchemaPublic(schema, context)),
		renderSharedTypes(snapshot),
		renderFieldBuilder(snapshot, imports),
		renderTypeInfo(snapshot, context),
		'// Framework registry',
		renderRegistry(snapshot, context),
	].filter((section) => section !== '')
	const sections = [
		`/* eslint-disable */\n\n// Generated by @ultimabase/codegen. Do not edit.\n// @ultimabase/schema-fingerprint sha256:${fingerprint}`,
		generatedSections.some((section) => section.includes('Core.'))
			? `import type * as Core from '@ultimabase/core'`
			: '',
		imports.render(),
		...generatedSections,
	].filter((section) => section !== '')
	const contents = `${sections.join('\n\n')}\n`

	return immutableRecord({ contents, fingerprint, snapshot })
}

/** Emits one deterministic, callback-free application declaration registry. */
export const generateApplicationTypes = (
	options: GenerateApplicationTypesOptions,
): GeneratedApplicationTypes =>
	generateApplicationTypesFromSnapshot(
		createTypegenSnapshot(options.application, options.applicationId),
	)
