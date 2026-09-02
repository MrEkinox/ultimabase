import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'

import * as ts from 'typescript'

const schemaCount = 48
const scalarFieldCount = 12
const completionMarker = '/* completion */'
const hoverMarker = '/* hover */'

const scalarName = (index) => `field${index}`
const scalarType = (index) => (index % 2 === 0 ? 'string' : 'number')
const scalarKind = (index) => (index % 2 === 0 ? 'TextField' : 'NumberField')

const commonSource = `
type ScalarFilter<TValue> = {
  readonly eq?: TValue
  readonly in?: readonly TValue[]
  readonly ne?: TValue
}
type Pointer<TItem> = {
  readonly id: string
  readonly findOne: () => Promise<TItem | null>
}
type StandardSchema<TValue> = {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: TValue) => { readonly value: TValue }
  }
}
type FieldOptions<TValue> = {
  readonly access?: { readonly read?: boolean; readonly write?: boolean }
  readonly hooks?: { readonly resolveInput?: (value: TValue) => TValue }
  readonly validation?: StandardSchema<TValue>
}
type PluginOperation<TInput, TResult> = {
  readonly execute: (input: TInput) => Promise<TResult>
  readonly prepare: (input: TInput) => { readonly payload: TInput }
}
type AlternativePolicy<TItem, TWhere> = {
  readonly item?: (item: TItem) => boolean
  readonly where?: (where: TWhere) => TWhere
}
type AlternativeBehavior<TItem> = {
  readonly after?: (item: TItem) => void
  readonly before?: (item: TItem) => void
}
`

const scalarProperties = (render) =>
	Array.from({ length: scalarFieldCount }, (_, index) => render(index)).join(
		'\n',
	)

const createGeneratedUsage = () =>
	Array.from(
		{ length: schemaCount },
		(_, index) => `
declare const api${index}: Schema${index}Api
declare const handle${index}: Schema${index}Handle
declare const item${index}: Schema${index}Item
const query${index} = api${index}.findMany({
  include: { related: { select: { field0: true }, where: { field0: { eq: 'next' } } } },
  select: { field0: true, field1: true },
  where: { field0: { eq: 'current' }, related: { is: { field1: { ne: 0 } } } },
})
const create${index} = api${index}.createOne({ data: { field0: 'created', field1: 1 }, select: { field0: true } })
const update${index} = api${index}.updateOne({ data: { field0: 'updated' }, where: { field1: { eq: 1 } } })
const access${index}: Schema${index}Access = { read: { item: ({ item }) => item.field0.length > 0 } }
const hooks${index}: Schema${index}Hooks = { beforeOperation: { update: ({ item }) => { void item.field1 } } }
const alternativePolicy${index}: AlternativePolicy<Schema${index}Item, Schema${index}WhereInput> = { item: (item) => item.field0.length > 0 }
const alternativeBehavior${index}: AlternativeBehavior<Schema${index}Item> = { before: (item) => { void item.field1 } }
const publish${index} = handle${index}.publish.execute({ data: { field0: 'published' }, id: String(${index}) })
void access${index}
void alternativeBehavior${index}
void alternativePolicy${index}
void create${index}
void hooks${index}
void publish${index}
void item${index}
void query${index}
void update${index}
`,
	).join('\n')

const createRecursiveUsage = () =>
	Array.from(
		{ length: schemaCount },
		(_, index) => `
declare const api${index}: SchemaApi<SchemaByName<'Schema${index}'>>
declare const handle${index}: SchemaHandle<SchemaByName<'Schema${index}'>>
declare const item${index}: ItemOf<SchemaByName<'Schema${index}'>>
const query${index} = api${index}.findMany({
  include: { related: { select: { field0: true }, where: { field0: { eq: 'next' } } } },
  select: { field0: true, field1: true },
  where: { field0: { eq: 'current' }, related: { is: { field1: { ne: 0 } } } },
})
const create${index} = api${index}.createOne({ data: { field0: 'created', field1: 1 }, select: { field0: true } })
const update${index} = api${index}.updateOne({ data: { field0: 'updated' }, where: { field1: { eq: 1 } } })
const access${index}: AccessOf<SchemaByName<'Schema${index}'>> = { read: { item: ({ item }) => item.field0.length > 0 } }
const hooks${index}: HooksOf<SchemaByName<'Schema${index}'>> = { beforeOperation: { update: ({ item }) => { void item.field1 } } }
const alternativePolicy${index}: AlternativePolicy<ItemOf<SchemaByName<'Schema${index}'>>, WhereOf<SchemaByName<'Schema${index}'>>> = { item: (item) => item.field0.length > 0 }
const alternativeBehavior${index}: AlternativeBehavior<ItemOf<SchemaByName<'Schema${index}'>>> = { before: (item) => { void item.field1 } }
const publish${index} = handle${index}.publish.execute({ data: { field0: 'published' }, id: String(${index}) })
void access${index}
void alternativeBehavior${index}
void alternativePolicy${index}
void create${index}
void hooks${index}
void publish${index}
void item${index}
void query${index}
void update${index}
`,
	).join('\n')

const createGeneratedSource = () => {
	const schemas = Array.from({ length: schemaCount }, (_, index) => {
		const next = (index + 1) % schemaCount
		const itemFields = scalarProperties(
			(fieldIndex) =>
				`  readonly ${scalarName(fieldIndex)}: ${scalarType(fieldIndex)}`,
		)
		const inputFields = scalarProperties(
			(fieldIndex) =>
				`  readonly ${scalarName(fieldIndex)}?: ${scalarType(fieldIndex)}`,
		)
		const whereFields = scalarProperties(
			(fieldIndex) =>
				`  readonly ${scalarName(fieldIndex)}?: ScalarFilter<${scalarType(fieldIndex)}>`,
		)
		const selectFields = scalarProperties(
			(fieldIndex) => `  readonly ${scalarName(fieldIndex)}?: true`,
		)

		return `
export type Schema${index}Item = {
  readonly id: string
${itemFields}
  readonly related: Pointer<Schema${next}Item> | null
}
export type Schema${index}CreateInput = {
${inputFields}
  readonly related?: Pointer<Schema${next}Item>
}
export type Schema${index}UpdateInput = Schema${index}CreateInput
export type Schema${index}WhereInput = {
${whereFields}
  readonly related?: { readonly is?: Schema${next}WhereInput }
}
export type Schema${index}Select = {
  readonly id?: true
${selectFields}
}
export type Schema${index}Include = {
  readonly related?: {
    readonly select?: Schema${next}Select
    readonly where?: Schema${next}WhereInput
  }
}
export type Schema${index}Access = {
  readonly read?: {
    readonly item?: (input: { readonly item: Schema${index}Item }) => boolean
    readonly where?: (input: { readonly where: Schema${index}WhereInput }) => Schema${index}WhereInput
  }
  readonly create?: boolean
  readonly update?: boolean
}
export type Schema${index}Hooks = {
  readonly beforeOperation?: {
    readonly create?: (input: { readonly item: Schema${index}Item }) => void
    readonly update?: (input: { readonly item: Schema${index}Item; readonly originalItem: Schema${index}Item }) => void
  }
}
export type Schema${index}PublishInput = {
  readonly data: Schema${index}UpdateInput
  readonly id: string
}
export type Schema${index}PublishResult = {
  readonly item: Schema${index}Item
  readonly published: true
}
export type Schema${index}Api = {
  readonly findMany: (input?: {
    readonly include?: Schema${index}Include
    readonly select?: Schema${index}Select
    readonly where?: Schema${index}WhereInput
  }) => Promise<readonly Schema${index}Item[]>
  readonly createOne: (input: { readonly data: Schema${index}CreateInput; readonly select?: Schema${index}Select }) => Promise<Schema${index}Item>
  readonly updateOne: (input: { readonly data: Schema${index}UpdateInput; readonly where: Schema${index}WhereInput }) => Promise<Schema${index}Item | null>
}
export type Schema${index}Handle = Schema${index}Api & {
  readonly publish: PluginOperation<Schema${index}PublishInput, Schema${index}PublishResult>
}
`
	}).join('\n')

	return `${commonSource}
${schemas}
${createGeneratedUsage()}
const selection: Schema0Select = { ${completionMarker} }
const exactItem = ${hoverMarker}item0
const fieldOptions: FieldOptions<string> = {
  access: { read: true },
  hooks: { resolveInput: (value) => value.trim() },
  validation: { '~standard': { version: 1, vendor: 'fixture', validate: (value) => ({ value }) } },
}
void exactItem
void fieldOptions
void selection
`
}

const createRecursiveSource = () => {
	const registry = Array.from({ length: schemaCount }, (_, index) => {
		const next = (index + 1) % schemaCount
		const fields = scalarProperties(
			(fieldIndex) =>
				`    readonly ${scalarName(fieldIndex)}: ${scalarKind(fieldIndex)}`,
		)

		return `SchemaDefinition<'Schema${index}', {
${fields}
    readonly related: PointerField<'Schema${next}'>
  }>`
	}).join(',\n  ')

	return `${commonSource}
type TextField = { readonly kind: 'text'; readonly options?: FieldOptions<string> }
type NumberField = { readonly kind: 'number'; readonly options?: FieldOptions<number> }
type PointerField<TTarget extends string> = { readonly kind: 'pointer'; readonly target: TTarget }
type AnyField = TextField | NumberField | PointerField<string>
type SchemaDefinition<TName extends string, TFields extends Readonly<Record<string, AnyField>>> = {
  readonly name: TName
  readonly fields: TFields
}
type Registry = readonly [
  ${registry}
]
type AnySchema = Registry[number]
type SchemaByName<TName extends string> = Extract<AnySchema, { readonly name: TName }>
type FieldOf<TSchema extends AnySchema, TName extends keyof TSchema['fields']> = TSchema['fields'][TName] & AnyField
type ItemValue<TField extends AnyField> =
  TField extends TextField ? string :
  TField extends NumberField ? number :
  TField extends PointerField<infer TTarget> ? Pointer<ItemOf<SchemaByName<TTarget>>> | null :
  never
type InputValue<TField extends AnyField> = Exclude<ItemValue<TField>, null>
type ItemOf<TSchema extends AnySchema> = {
  readonly id: string
} & {
  readonly [TName in keyof TSchema['fields']]: ItemValue<FieldOf<TSchema, TName>>
}
type CreateInputOf<TSchema extends AnySchema> = {
  readonly [TName in keyof TSchema['fields']]?: InputValue<FieldOf<TSchema, TName>>
}
type UpdateInputOf<TSchema extends AnySchema> = CreateInputOf<TSchema>
type WhereValue<TField extends AnyField> =
  TField extends PointerField<infer TTarget> ? { readonly is?: WhereOf<SchemaByName<TTarget>> } :
  ScalarFilter<ItemValue<TField>>
type WhereOf<TSchema extends AnySchema> = {
  readonly [TName in keyof TSchema['fields']]?: WhereValue<FieldOf<TSchema, TName>>
}
type SelectOf<TSchema extends AnySchema> = {
  readonly id?: true
} & {
  readonly [TName in keyof TSchema['fields'] as FieldOf<TSchema, TName> extends PointerField<string> ? never : TName]?: true
}
type IncludeValue<TField extends AnyField> =
  TField extends PointerField<infer TTarget> ? {
    readonly select?: SelectOf<SchemaByName<TTarget>>
    readonly where?: WhereOf<SchemaByName<TTarget>>
  } : never
type IncludeOf<TSchema extends AnySchema> = {
  readonly [TName in keyof TSchema['fields'] as FieldOf<TSchema, TName> extends PointerField<string> ? TName : never]?: IncludeValue<FieldOf<TSchema, TName>>
}
type AccessOf<TSchema extends AnySchema> = {
  readonly read?: {
    readonly item?: (input: { readonly item: ItemOf<TSchema> }) => boolean
    readonly where?: (input: { readonly where: WhereOf<TSchema> }) => WhereOf<TSchema>
  }
  readonly create?: boolean
  readonly update?: boolean
}
type HooksOf<TSchema extends AnySchema> = {
  readonly beforeOperation?: {
    readonly create?: (input: { readonly item: ItemOf<TSchema> }) => void
    readonly update?: (input: { readonly item: ItemOf<TSchema>; readonly originalItem: ItemOf<TSchema> }) => void
  }
}
type PublishInputOf<TSchema extends AnySchema> = {
  readonly data: UpdateInputOf<TSchema>
  readonly id: string
}
type PublishResultOf<TSchema extends AnySchema> = {
  readonly item: ItemOf<TSchema>
  readonly published: true
}
type SchemaApi<TSchema extends AnySchema> = {
  readonly findMany: (input?: {
    readonly include?: IncludeOf<TSchema>
    readonly select?: SelectOf<TSchema>
    readonly where?: WhereOf<TSchema>
  }) => Promise<readonly ItemOf<TSchema>[]>
  readonly createOne: (input: { readonly data: CreateInputOf<TSchema>; readonly select?: SelectOf<TSchema> }) => Promise<ItemOf<TSchema>>
  readonly updateOne: (input: { readonly data: UpdateInputOf<TSchema>; readonly where: WhereOf<TSchema> }) => Promise<ItemOf<TSchema> | null>
}
type SchemaHandle<TSchema extends AnySchema> = SchemaApi<TSchema> & {
  readonly publish: PluginOperation<PublishInputOf<TSchema>, PublishResultOf<TSchema>>
}
${createRecursiveUsage()}
const selection: SelectOf<SchemaByName<'Schema0'>> = { ${completionMarker} }
const exactItem = ${hoverMarker}item0
const fieldOptions: FieldOptions<string> = {
  access: { read: true },
  hooks: { resolveInput: (value) => value.trim() },
  validation: { '~standard': { version: 1, vendor: 'fixture', validate: (value) => ({ value }) } },
}
void exactItem
void fieldOptions
void selection
`
}

const scenario = process.argv[2]
if (scenario !== 'generated' && scenario !== 'recursive') {
	throw new TypeError('Expected generated or recursive scenario')
}

const sourceWithMarkers =
	scenario === 'generated' ? createGeneratedSource() : createRecursiveSource()
const completionPosition = sourceWithMarkers.indexOf(completionMarker)
const hoverPosition = sourceWithMarkers.indexOf(hoverMarker)
const source = sourceWithMarkers
	.replace(completionMarker, ' '.repeat(completionMarker.length))
	.replace(hoverMarker, ' '.repeat(hoverMarker.length))
const fileName = path.resolve(`typegen-editor-${scenario}.fixture.ts`)
const host = {
	fileExists: (requestedFileName) => ts.sys.fileExists(requestedFileName),
	getCompilationSettings: () => ({
		exactOptionalPropertyTypes: true,
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		strict: true,
		target: ts.ScriptTarget.ESNext,
	}),
	getCurrentDirectory: () => process.cwd(),
	getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
	getScriptFileNames: () => [fileName],
	getScriptSnapshot: (requestedFileName) => {
		const contents =
			requestedFileName === fileName
				? source
				: ts.sys.readFile(requestedFileName)
		return contents === undefined
			? undefined
			: ts.ScriptSnapshot.fromString(contents)
	},
	getScriptVersion: () => '0',
	readFile: (requestedFileName) => ts.sys.readFile(requestedFileName),
}
const service = ts.createLanguageService(host)
const typecheckStartedAt = performance.now()
const diagnostics = service.getSemanticDiagnostics(fileName)
const typecheckDurationMs = performance.now() - typecheckStartedAt
const completionStartedAt = performance.now()
const completionNames =
	service
		.getCompletionsAtPosition(fileName, completionPosition, {})
		?.entries.map(({ name }) => name) ?? []
const completionLatencyMs = performance.now() - completionStartedAt
const hoverStartedAt = performance.now()
const hover = service.getQuickInfoAtPosition(
	fileName,
	hoverPosition + hoverMarker.length,
)
const hoverLatencyMs = performance.now() - hoverStartedAt

globalThis.gc?.()
const memory = process.memoryUsage()
const result = {
	completionLatencyMs,
	completionNames,
	diagnosticCount: diagnostics.length,
	diagnosticMessages: diagnostics.map(({ messageText }) =>
		ts.flattenDiagnosticMessageText(messageText, '\n'),
	),
	heapUsedMiB: memory.heapUsed / 1024 / 1024,
	hoverLatencyMs,
	hoverOutput: ts.displayPartsToString(hover?.displayParts),
	rssMiB: memory.rss / 1024 / 1024,
	scenario,
	schemaCount,
	scalarFieldCount,
	typecheckDurationMs,
}

service.dispose()
process.stdout.write(`${JSON.stringify(result)}\n`)
