import { performance } from 'node:perf_hooks'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	callPrototypeFieldMethod,
	compilePrototypeApplication,
	definePrototypeSchema,
	prototypeVectorPlugin,
	type PrototypeFieldMethodDefinition,
	type PrototypePlugin,
	type PrototypeRuntimeFieldBuilder,
} from '../../tooling/prototypes/generated-schema-authoring/runtime.js'
import { generatePrototypeDeclarations } from '../../tooling/prototypes/generated-schema-authoring/generator.js'
import { createLanguageService } from '../../tooling/vitest/typescript-language-service.js'

interface BootstrapModule {
	readonly default: (dependencies: {
		readonly defineSchema: typeof definePrototypeSchema
		readonly vectorPlugin: typeof prototypeVectorPlugin
	}) => unknown
}

const isBootstrapModule = (value: unknown): value is BootstrapModule =>
	typeof value === 'object' &&
	value !== null &&
	'default' in value &&
	typeof value.default === 'function'

const createFixtureApplication = (withVector = true) => {
	const User = definePrototypeSchema({
		className: 'GeneratedUser',
		fields(field) {
			field.string('name', { validation: { required: true } })
		},
	})
	const Comment = definePrototypeSchema({
		className: 'GeneratedComment',
		fields(field) {
			field.string('body', { validation: { required: true } })
			field.boolean('moderated', { validation: { required: true } })
		},
	})
	const Document = definePrototypeSchema({
		className: 'GeneratedDocument',
		fields(field) {
			field.string('title', { validation: { required: true } })
			field.string('secret', { validation: { required: true } })
			field.enum('status', {
				validation: { required: true },
				values: ['draft', 'published'],
			})
			field.object('profile', {
				fields(nested: PrototypeRuntimeFieldBuilder) {
					nested.string('displayName', {
						validation: { required: true },
					})
				},
				validation: { required: true },
			})
			field.pointer('author', {
				target: () => User,
				validation: { required: true },
			})
			field.relation('comments', { target: () => Comment })
			if (withVector) {
				callPrototypeFieldMethod(field, 'vector', 'embedding', {
					dimensions: 3,
					validation: { required: true },
				})
			}
		},
	})
	const application = compilePrototypeApplication({
		plugins: withVector ? [prototypeVectorPlugin()] : [],
		schemas: [User, Comment, Document],
	})

	return { application, Comment, Document, User }
}

const completionNamesAt = (
	service: ts.LanguageService,
	fileName: string,
	source: string,
	marker: string,
): ReadonlySet<string> => {
	const position = source.indexOf(marker)

	if (position < 0) throw new TypeError(`Missing completion marker: ${marker}`)

	return new Set(
		service
			.getCompletionsAtPosition(fileName, position, {})
			?.entries.map(({ name }) => name) ?? [],
	)
}

const quickInfoTextAt = (
	service: ts.LanguageService,
	fileName: string,
	source: string,
	marker: string,
): string => {
	const markerPosition = source.indexOf(marker)

	if (markerPosition < 0) throw new TypeError(`Missing hover marker: ${marker}`)

	const quickInfo = service.getQuickInfoAtPosition(
		fileName,
		markerPosition + marker.length,
	)

	if (quickInfo === undefined) {
		throw new TypeError(`Missing QuickInfo at marker: ${marker}`)
	}

	return ts.displayPartsToString(quickInfo.displayParts)
}

const generatedConsumerSource = `
const GeneratedUser = Schema.define({
	className: 'GeneratedUser',
	fields(field) {
		field.string('name', { validation: { required: true } })
	},
})

const GeneratedComment = Schema.define({
	className: 'GeneratedComment',
	fields(field) {
		field.string('body', { validation: { required: true } })
		field.boolean('moderated', { validation: { required: true } })
	},
})

const GeneratedDocument = Schema.define({
	className: 'GeneratedDocument',
	fields(field) {
		field./* field-methods */string('temporary')
		field.string('title', { validation: { required: true } })
		field.string('secret', {
			validation: { required: true },
			access: {
				read: {
					output: {
						select: { title: true, status: true },
						allow: ({ item }) => {
							item./* field-access-item */status
							return item.status === 'published'
						},
					},
				},
			},
		})
		field.enum('status', {
			validation: { required: true },
			values: ['draft', 'published'],
		})
		field.object('profile', {
			fields(nested) {
				nested./* nested-field-methods */string('temporary')
				nested.string('displayName', {
					validation: { required: true },
				})
			},
			validation: { required: true },
		})
		field.pointer('author', {
			target: () => GeneratedUser,
			validation: { required: true },
		})
		field.relation('comments', { target: () => GeneratedComment })
		field.vector('embedding', {
			dimensions: 3,
			validation: { required: true },
		})
	},
	access: {
		item: {
			update: ({ item }) => {
				item./* schema-access-item */status
				return item.status !== 'draft'
			},
		},
	},
	hooks: {
		beforeOperation: {
			update: ({ item }) => {
				item./* schema-hook-item */embedding
			},
		},
	},
})

const generatedDraft = new GeneratedDocument({
	author: { className: 'GeneratedUser', id: 'user-1' },
	embedding: [0, 1, 2],
	profile: { displayName: 'Ada' },
	secret: 'private',
	status: 'published',
	title: 'Generated types',
})

generatedDraft./* draft-item */embedding
generatedDraft./* vector-hover */embedding
generatedDraft./* enum-hover */status
generatedDraft./* object-hover */profile
generatedDraft./* pointer-hover */author

GeneratedDocument.findMany({
	select: { /* query-select */ title: true },
	include: {
		comments: {
			select: { /* relation-select */ body: true },
		},
	},
})
`

const invalidGeneratedConsumerSource = `
Schema.define({
	className: 'GeneratedDocument',
	fields(field) {
		field.string('secret', {
			access: {
				read: {
					output: {
						select: { title: true },
						allow: ({ item }) => item.embedding.length > 0,
					},
				},
			},
		})
	},
})
`

const recursiveBaselineSource = (fieldCount: number): string => {
	const fields = Array.from(
		{ length: fieldCount },
		(_, index) => `field${String(index)}: field<string>()`,
	).join(',\n')

	return `
interface Field<TValue> { readonly value: TValue }
declare const field: <TValue>() => Field<TValue>
type InferFields<TFields extends Readonly<Record<string, Field<unknown>>>> = {
	readonly [TName in keyof TFields]: TFields[TName] extends Field<infer TValue>
		? TValue
		: never
}
type RecursiveSelect<TFields extends Readonly<Record<string, Field<unknown>>>> = {
	readonly [TName in keyof InferFields<TFields>]?: boolean
}
declare const define: <const TFields extends Readonly<Record<string, Field<unknown>>>>(
	fields: TFields,
) => { findMany(options: { select: RecursiveSelect<TFields> }): void }
const Model = define({ ${fields} })
Model.findMany({ select: { /* measured-completion */ field0: true } })
`
}

const generatedBaselineSource = (fieldCount: number): string => {
	const properties = Array.from(
		{ length: fieldCount },
		(_, index) => `readonly field${String(index)}: string`,
	).join('\n')

	return `
interface GeneratedItem { ${properties} }
type GeneratedSelect = { readonly [TName in keyof GeneratedItem]?: boolean }
declare const Model: { findMany(options: { select: GeneratedSelect }): void }
Model.findMany({ select: { /* measured-completion */ field0: true } })
`
}

const measureLanguageService = (source: string) => {
	const fileName = `${import.meta.dirname}/generated-schema-measurement.ts`
	const heapBefore = process.memoryUsage().heapUsed
	const service = createLanguageService(fileName, source)
	const diagnosticsStart = performance.now()
	const diagnostics = service.getSemanticDiagnostics(fileName)
	const diagnosticsMs = performance.now() - diagnosticsStart
	const completionStart = performance.now()
	const completions = completionNamesAt(
		service,
		fileName,
		source,
		'/* measured-completion */',
	)
	const completionMs = performance.now() - completionStart
	const heapAfter = process.memoryUsage().heapUsed

	service.dispose()

	return {
		completionCount: completions.size,
		completionMs,
		diagnostics: diagnostics.length,
		diagnosticsMs,
		heapAfter,
		heapBefore,
	}
}

describe('generated schema authoring prototype', () => {
	it('defers field callbacks until plugins declare their methods', () => {
		let declarations = 0
		const Document = definePrototypeSchema({
			className: 'DeferredDocument',
			fields(field) {
				declarations += 1
				callPrototypeFieldMethod(field, 'vector', 'embedding', {
					dimensions: 3,
				})
			},
		})

		expect(declarations).toBe(0)
		expect(() => Document.fields).toThrow('fields are unresolved')
		expect(() => new Document({ embedding: [0, 1, 2] })).toThrow(
			'compile the application before constructing a model',
		)

		const application = compilePrototypeApplication({
			plugins: [prototypeVectorPlugin()],
			schemas: [Document],
		})

		expect(declarations).toBe(1)
		expect(application.schema(Document).fields[0]?.owner).toBe(
			'@ultimabase/pg-vector-plugin',
		)
		expect(new Document({ embedding: [0, 1, 2] }).toJSON()).toStrictEqual({
			embedding: [0, 1, 2],
		})
	})

	it('loads an initially untyped plugin method through transpilation', async () => {
		const source = `
type BootstrapMethod = (name: string, options?: Readonly<Record<string, unknown>>) => void
interface BootstrapBuilder { readonly string: BootstrapMethod }
interface BootstrapSchema { readonly className: string; readonly fields: (field: BootstrapBuilder) => void }
interface BootstrapRuntime {
	readonly defineSchema: (options: BootstrapSchema) => unknown
	readonly vectorPlugin: () => unknown
}
export default (runtime: BootstrapRuntime) => ({
	plugins: [runtime.vectorPlugin()],
	schemas: [runtime.defineSchema({
		className: 'BootstrapDocument',
		fields(field) {
			field.vector('embedding', { dimensions: 3 })
		},
	})],
})
`
		const bootstrapFileName = `${import.meta.dirname}/bootstrap-before-typegen.ts`
		const bootstrapService = createLanguageService(bootstrapFileName, source)
		const bootstrapMessages = bootstrapService
			.getSemanticDiagnostics(bootstrapFileName)
			.map(({ messageText }) =>
				ts.flattenDiagnosticMessageText(messageText, '\n'),
			)

		expect(
			bootstrapMessages.some(
				(message) =>
					message.includes("Property 'vector' does not exist") &&
					message.includes('BootstrapBuilder'),
			),
		).toBe(true)
		bootstrapService.dispose()

		const transpiled = ts.transpileModule(source, {
			compilerOptions: {
				module: ts.ModuleKind.ESNext,
				target: ts.ScriptTarget.ES2024,
			},
			reportDiagnostics: true,
		})

		expect(transpiled.diagnostics).toStrictEqual([])
		expect(transpiled.outputText).toContain("field.vector('embedding'")

		const url = `data:text/javascript;base64,${Buffer.from(
			transpiled.outputText,
		).toString('base64')}`
		const loaded: unknown = await import(url)

		if (!isBootstrapModule(loaded)) {
			throw new TypeError('Transpiled bootstrap did not export its loader')
		}

		const configuration: unknown = loaded.default({
			defineSchema: definePrototypeSchema,
			vectorPlugin: prototypeVectorPlugin,
		})

		if (
			typeof configuration !== 'object' ||
			configuration === null ||
			!('plugins' in configuration) ||
			!Array.isArray(configuration.plugins) ||
			!('schemas' in configuration) ||
			!Array.isArray(configuration.schemas)
		) {
			throw new TypeError('Transpiled bootstrap returned invalid configuration')
		}

		expect(configuration.plugins[0]).toMatchObject({
			name: '@ultimabase/pg-vector-plugin',
		})
		expect(configuration.schemas[0]).toHaveProperty(
			'className',
			'BootstrapDocument',
		)
	})

	it('rejects missing and conflicting plugin field methods deterministically', () => {
		const Missing = definePrototypeSchema({
			className: 'MissingVectorDocument',
			fields(field) {
				callPrototypeFieldMethod(field, 'vector', 'embedding', {
					dimensions: 3,
				})
			},
		})

		expect(() =>
			compilePrototypeApplication({ plugins: [], schemas: [Missing] }),
		).toThrow('no configured plugin declared it')

		const conflictingDefinition: PrototypeFieldMethodDefinition = {
			create: () => ({
				required: false,
				value: { kind: 'readonly-number-array' },
			}),
			name: 'vector',
			typegen: {
				options: [],
				value: { kind: 'readonly-number-array' },
			},
		}
		const conflict: PrototypePlugin = {
			declare: (fields) => {
				fields.register(conflictingDefinition)
			},
			name: 'fixture.vector-conflict',
		}

		expect(() =>
			compilePrototypeApplication({
				plugins: [prototypeVectorPlugin(), conflict],
				schemas: [Missing],
			}),
		).toThrow(
			'Field method vector from fixture.vector-conflict conflicts with @ultimabase/pg-vector-plugin',
		)

		const firstApplication = compilePrototypeApplication({
			plugins: [conflict],
			schemas: [Missing],
		})
		expect(firstApplication.schema(Missing).fields[0]?.owner).toBe(
			'fixture.vector-conflict',
		)
		expect(() =>
			compilePrototypeApplication({
				plugins: [prototypeVectorPlugin()],
				schemas: [Missing],
			}),
		).toThrow('compiled differently in another application')

		const Shared = definePrototypeSchema({
			className: 'SharedVectorDocument',
			fields(field) {
				callPrototypeFieldMethod(field, 'vector', 'embedding', {
					dimensions: 3,
				})
			},
		})
		const firstCompatible = compilePrototypeApplication({
			plugins: [prototypeVectorPlugin()],
			schemas: [Shared],
		})
		const secondCompatible = compilePrototypeApplication({
			plugins: [prototypeVectorPlugin()],
			schemas: [Shared],
		})

		expect(secondCompatible.schema(Shared)).not.toBe(
			firstCompatible.schema(Shared),
		)
		expect(secondCompatible.schema(Shared).fields).toStrictEqual(
			firstCompatible.schema(Shared).fields,
		)
	})

	it('generates exact stable-TypeScript completions without application leakage', () => {
		const { application } = createFixtureApplication()
		const declarations = generatePrototypeDeclarations(application)
		const source = `${declarations}\n${generatedConsumerSource}`
		const fileName = `${import.meta.dirname}/generated-schema-consumer.ts`
		const service = createLanguageService(fileName, source)

		expect(service.getSyntacticDiagnostics(fileName)).toStrictEqual([])
		expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])
		expect(declarations).not.toMatch(/\bany\b/u)

		const fieldMethods = completionNamesAt(
			service,
			fileName,
			source,
			'/* field-methods */',
		)
		expect(fieldMethods.has('string')).toBe(true)
		expect(fieldMethods.has('vector')).toBe(true)
		expect(
			completionNamesAt(
				service,
				fileName,
				source,
				'/* nested-field-methods */',
			).has('vector'),
		).toBe(true)

		for (const marker of [
			'/* schema-access-item */',
			'/* schema-hook-item */',
		]) {
			const names = completionNamesAt(service, fileName, source, marker)
			expect(names.has('embedding')).toBe(true)
			expect(names.has('profile')).toBe(true)
			expect(names.has('status')).toBe(true)
		}

		const fieldAccess = completionNamesAt(
			service,
			fileName,
			source,
			'/* field-access-item */',
		)
		expect(fieldAccess.has('title')).toBe(true)
		expect(fieldAccess.has('status')).toBe(true)
		expect(fieldAccess.has('embedding')).toBe(false)

		const select = completionNamesAt(
			service,
			fileName,
			source,
			'/* query-select */',
		)
		expect(select.has('embedding')).toBe(true)
		expect(select.has('profile')).toBe(true)
		expect(select.has('comments')).toBe(false)

		const draftItem = completionNamesAt(
			service,
			fileName,
			source,
			'/* draft-item */',
		)
		expect(draftItem.has('embedding')).toBe(true)
		expect(draftItem.has('profile')).toBe(true)
		expect(draftItem.has('comments')).toBe(false)
		expect(
			quickInfoTextAt(service, fileName, source, '/* vector-hover */'),
		).toContain('readonly number[]')
		expect(
			quickInfoTextAt(service, fileName, source, '/* enum-hover */'),
		).toContain('"draft" | "published"')
		expect(
			quickInfoTextAt(service, fileName, source, '/* object-hover */'),
		).toContain('displayName')
		expect(
			quickInfoTextAt(service, fileName, source, '/* pointer-hover */'),
		).toContain('PrototypePointer<"GeneratedUser">')

		const relationSelect = completionNamesAt(
			service,
			fileName,
			source,
			'/* relation-select */',
		)
		expect(relationSelect.has('moderated')).toBe(true)
		expect(relationSelect.has('embedding')).toBe(false)

		service.dispose()

		const invalidSource = `${declarations}\n${invalidGeneratedConsumerSource}`
		const invalidFileName = `${import.meta.dirname}/invalid-generated-schema-consumer.ts`
		const invalidService = createLanguageService(invalidFileName, invalidSource)
		const invalidMessages = invalidService
			.getSemanticDiagnostics(invalidFileName)
			.map(({ messageText }) =>
				ts.flattenDiagnosticMessageText(messageText, '\n'),
			)

		expect(
			invalidMessages.some((message) => message.includes("'embedding'")),
		).toBe(true)
		invalidService.dispose()

		const withoutVector = createFixtureApplication(false)
		const isolatedDeclarations = generatePrototypeDeclarations(
			withoutVector.application,
		)
		const isolatedSource = `${isolatedDeclarations}\nSchema.define({ className: 'GeneratedUser', fields(field) { field./* isolated-methods */string('temporary') } })`
		const isolatedFileName = `${import.meta.dirname}/isolated-generated-schema.ts`
		const isolatedService = createLanguageService(
			isolatedFileName,
			isolatedSource,
		)
		const isolatedMethods = completionNamesAt(
			isolatedService,
			isolatedFileName,
			isolatedSource,
			'/* isolated-methods */',
		)

		expect(isolatedMethods.has('string')).toBe(true)
		expect(isolatedMethods.has('vector')).toBe(false)
		isolatedService.dispose()
	})

	it('records baseline and generated editor observations without a fixed claim', () => {
		const baseline = measureLanguageService(recursiveBaselineSource(80))
		const generated = measureLanguageService(generatedBaselineSource(80))

		expect(baseline.diagnostics).toBe(0)
		expect(generated.diagnostics).toBe(0)
		expect(baseline.completionCount).toBeGreaterThanOrEqual(79)
		expect(generated.completionCount).toBeGreaterThanOrEqual(79)
		expect(Number.isFinite(baseline.completionMs)).toBe(true)
		expect(Number.isFinite(generated.completionMs)).toBe(true)

		console.info(
			'generated-schema-authoring-observation',
			JSON.stringify({ baseline, generated }),
		)
	})
})
