import type {
	PrototypeCompiledApplication,
	PrototypeCompiledField,
	PrototypeTypeNode,
} from './runtime.js'

const quote = (value: string): string => JSON.stringify(value)

const typeName = (value: string): string => {
	const normalized = value.replaceAll(/[^A-Za-z0-9_$]/gu, '_')

	return /^[A-Za-z_$]/u.test(normalized) ? normalized : `_${normalized}`
}

const renderValueType = (value: PrototypeTypeNode): string => {
	switch (value.kind) {
		case 'boolean':
			return 'boolean'
		case 'enum':
			return value.values.length === 0
				? 'string'
				: value.values.map(quote).join(' | ')
		case 'object':
			return renderObjectType(value.fields)
		case 'pointer':
			return `PrototypePointer<${quote(value.target)}>`
		case 'readonly-number-array':
			return 'readonly number[]'
		case 'relation':
			return `PrototypeRelation<${quote(value.target)}>`
		case 'string':
			return 'string'
	}
}

const renderObjectType = (
	fields: readonly PrototypeCompiledField[],
): string => {
	const properties = fields
		.filter(({ value }) => value.kind !== 'relation')
		.map((field) => {
			const value = renderValueType(field.value)
			return `readonly ${quote(field.name)}: ${field.required ? value : `${value} | null`}`
		})

	return `Readonly<{ ${properties.join('; ')} }>`
}

const renderCreateType = (
	fields: readonly PrototypeCompiledField[],
): string => {
	const properties = fields
		.filter(({ value }) => value.kind !== 'relation')
		.map((field) => {
			const value = renderValueType(field.value)
			return field.required
				? `readonly ${quote(field.name)}: ${value}`
				: `readonly ${quote(field.name)}?: ${value} | null`
		})

	return `Readonly<{ ${properties.join('; ')} }>`
}

const renderRelationsType = (
	fields: readonly PrototypeCompiledField[],
): string => {
	const properties = fields.flatMap((field) =>
		field.value.kind === 'relation'
			? [`readonly ${quote(field.name)}: ${quote(field.value.target)}`]
			: [],
	)

	return `Readonly<{ ${properties.join('; ')} }>`
}

const renderExtraOptions = (
	options: readonly {
		readonly name: string
		readonly required: boolean
		readonly type: 'number'
	}[],
): string => {
	if (options.length === 0) return ''

	return ` & Readonly<{ ${options
		.map(
			(option) =>
				`${quote(option.name)}${option.required ? '' : '?'}: ${option.type}`,
		)
		.join('; ')} }>`
}

const renderBuilderMethod = (
	schemaType: string,
	method: PrototypeCompiledApplication['methods'][number],
): string => {
	const common = `PrototypeFieldOptions<${renderValueType(method.typegen.value)}, ${schemaType}Item, TSelection>`
	const extra = renderExtraOptions(method.typegen.options)

	switch (method.name) {
		case 'enum':
			return `${quote(method.name)}<const TValues extends readonly [string, ...string[]], const TSelection extends PrototypeSelect<${schemaType}Item> = {}>(name: string, options: ${common} & Readonly<{ values: TValues }>): void`
		case 'object':
			return `${quote(method.name)}<const TSelection extends PrototypeSelect<${schemaType}Item> = {}>(name: string, options: ${common} & Readonly<{ fields(field: ${schemaType}FieldBuilder): void }>): void`
		case 'pointer':
		case 'relation':
			return `${quote(method.name)}<const TSelection extends PrototypeSelect<${schemaType}Item> = {}>(name: string, options: ${common} & Readonly<{ target: () => unknown }>): void`
		default:
			return `${quote(method.name)}<const TSelection extends PrototypeSelect<${schemaType}Item> = {}>(name: string, options?: ${common}${extra}): void`
	}
}

const prelude = `
type PrototypeSelect<TItem extends object> = Readonly<{
	[TName in keyof TItem]?: boolean
}>

type PrototypeTrueKeys<TSelection> = {
	[TName in keyof TSelection]: TSelection[TName] extends true ? TName : never
}[keyof TSelection]

type PrototypeSelected<TItem extends object, TSelection> =
	keyof TSelection extends never
		? Readonly<TItem>
		: Readonly<Pick<TItem, Extract<PrototypeTrueKeys<TSelection>, keyof TItem>>>

interface PrototypePointer<TTarget extends string> {
	readonly className: TTarget
	readonly id: string
}

interface PrototypeRelation<TTarget extends string> {
	readonly target: TTarget
}

interface PrototypeFieldOptions<
	TValue,
	TItem extends object,
	TSelection extends PrototypeSelect<TItem>,
> {
	readonly access?: {
		readonly read?: {
			readonly output?: {
				readonly select: TSelection
				readonly allow?: (input: {
					readonly item: PrototypeSelected<TItem, TSelection>
					readonly value: TValue
				}) => boolean
			}
		}
	}
	readonly hooks?: {
		readonly resolveInput?: (input: { readonly value: TValue }) => TValue
	}
	readonly validation?: { readonly required?: boolean }
}

interface PrototypeSchemaContract<
	TItem extends object,
	TCreate extends object,
	TRelations extends Readonly<Record<string, string>>,
	TFieldBuilder,
> {
	readonly Create: TCreate
	readonly FieldBuilder: TFieldBuilder
	readonly Item: TItem
	readonly Relations: TRelations
}

type PrototypeItem<TContract> = TContract extends PrototypeSchemaContract<
	infer TItem,
	object,
	Readonly<Record<string, string>>,
	unknown
>
	? TItem
	: never

type PrototypeCreate<TContract> = TContract extends PrototypeSchemaContract<
	object,
	infer TCreate,
	Readonly<Record<string, string>>,
	unknown
>
	? TCreate
	: never

type PrototypeRelations<TContract> = TContract extends PrototypeSchemaContract<
	object,
	object,
	infer TRelations,
	unknown
>
	? TRelations
	: never

type PrototypeBuilder<TContract> = TContract extends PrototypeSchemaContract<
	object,
	object,
	Readonly<Record<string, string>>,
	infer TBuilder
>
	? TBuilder
	: never

type PrototypeSchemaItemByName<TName extends keyof PrototypeGeneratedSchemas> =
	PrototypeItem<PrototypeGeneratedSchemas[TName]>

type PrototypeInclude<TRelations extends Readonly<Record<string, string>>> =
	Readonly<{
		[TName in keyof TRelations]?: TRelations[TName] extends keyof PrototypeGeneratedSchemas
			? Readonly<{
					select?: PrototypeSelect<
						PrototypeSchemaItemByName<TRelations[TName]>
					>
				}>
			: never
	}>

interface PrototypeSchemaOptions<
	TName extends keyof PrototypeGeneratedSchemas,
	TContract extends PrototypeGeneratedSchemas[TName],
> {
	readonly access?: {
		readonly item?: {
			readonly update?: (input: {
				readonly item: PrototypeItem<TContract>
				readonly originalItem: PrototypeItem<TContract>
			}) => boolean
		}
	}
	readonly className: TName
	readonly fields: (field: PrototypeBuilder<TContract>) => void
	readonly hooks?: {
		readonly beforeOperation?: {
			readonly update?: (input: {
				readonly item: PrototypeItem<TContract>
				readonly originalItem: PrototypeItem<TContract>
			}) => void
		}
	}
}

interface PrototypeSchemaModel<TContract> {
	new (input: PrototypeCreate<TContract>): PrototypeItem<TContract>
	findMany<
		const TSelection extends PrototypeSelect<PrototypeItem<TContract>>,
	>(options?: Readonly<{
		include?: PrototypeInclude<PrototypeRelations<TContract>>
		select?: TSelection
	}>): Promise<readonly PrototypeSelected<PrototypeItem<TContract>, TSelection>[]>
}
`

/** Emits one self-contained declaration used only by the architecture proof. */
export const generatePrototypeDeclarations = (
	application: PrototypeCompiledApplication,
): string => {
	const schemaSections = application.schemas.map((schema) => {
		const name = typeName(schema.className)
		const itemFields = schema.fields.filter(
			({ value }) => value.kind !== 'relation',
		)
		const item = renderObjectType([
			{
				method: 'system',
				name: 'id',
				owner: '@ultimabase/core',
				path: `${schema.className}.id`,
				required: true,
				value: { kind: 'string' },
			},
			...itemFields,
		])
		const create = renderCreateType(itemFields)
		const relations = renderRelationsType(schema.fields)
		const methods = application.methods
			.map((method) => `\t${renderBuilderMethod(name, method)}`)
			.join('\n')

		return `
type ${name}Item = ${item}
type ${name}Create = ${create}
type ${name}Relations = ${relations}
interface ${name}FieldBuilder {
${methods}
}
type ${name}Contract = PrototypeSchemaContract<
	${name}Item,
	${name}Create,
	${name}Relations,
	${name}FieldBuilder
>
`
	})
	const registryEntries = application.schemas
		.map(
			(schema) =>
				`\treadonly ${quote(schema.className)}: ${typeName(schema.className)}Contract`,
		)
		.join('\n')

	return `${prelude}\n${schemaSections.join('\n')}\ninterface PrototypeGeneratedSchemas {\n${registryEntries}\n}\n\ndeclare const Schema: {\n\tdefine<const TName extends keyof PrototypeGeneratedSchemas>(options: PrototypeSchemaOptions<TName, PrototypeGeneratedSchemas[TName]>): PrototypeSchemaModel<PrototypeGeneratedSchemas[TName]>\n}\n`
}
