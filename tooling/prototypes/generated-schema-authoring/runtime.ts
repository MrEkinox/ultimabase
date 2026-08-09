/**
 * Disposable runtime proof for the generated schema-authoring milestone.
 *
 * This module deliberately does not import Core. It isolates the lifecycle
 * question without introducing a second production implementation.
 */

export type PrototypeTypeNode =
	| { readonly kind: 'boolean' }
	| { readonly kind: 'enum'; readonly values: readonly string[] }
	| {
			readonly fields: readonly PrototypeCompiledField[]
			readonly kind: 'object'
	  }
	| { readonly kind: 'pointer'; readonly target: string }
	| { readonly kind: 'readonly-number-array' }
	| { readonly kind: 'relation'; readonly target: string }
	| { readonly kind: 'string' }

export interface PrototypeCompiledField {
	readonly method: string
	readonly name: string
	readonly owner: string
	readonly path: string
	readonly required: boolean
	readonly value: PrototypeTypeNode
}

export interface PrototypeFieldMethodTypegen {
	readonly options: readonly PrototypeTypegenOption[]
	readonly value: PrototypeTypeNode
}

export interface PrototypeTypegenOption {
	readonly name: string
	readonly required: boolean
	readonly type: 'number'
}

interface PrototypeFieldFactoryContext {
	readonly buildNested: (
		declaration: PrototypeFieldDeclaration,
		path: string,
	) => readonly PrototypeCompiledField[]
	readonly method: string
	readonly name: string
	readonly options: Readonly<Record<string, unknown>>
	readonly owner: string
	readonly path: string
}

export interface PrototypeFieldMethodDefinition {
	readonly create: (
		context: PrototypeFieldFactoryContext,
	) => Omit<PrototypeCompiledField, 'method' | 'name' | 'owner' | 'path'>
	readonly name: string
	readonly typegen: PrototypeFieldMethodTypegen
}

interface OwnedPrototypeFieldMethod extends PrototypeFieldMethodDefinition {
	readonly owner: string
}

export type PrototypeRuntimeFieldMethod = (
	name: string,
	options?: Readonly<Record<string, unknown>>,
) => void

/** Provides the intentionally broad bootstrap surface used before typegen. */
export interface PrototypeRuntimeFieldBuilder extends Readonly<
	Record<string, PrototypeRuntimeFieldMethod | undefined>
> {
	readonly boolean: PrototypeRuntimeFieldMethod
	readonly enum: PrototypeRuntimeFieldMethod
	readonly object: PrototypeRuntimeFieldMethod
	readonly pointer: PrototypeRuntimeFieldMethod
	readonly relation: PrototypeRuntimeFieldMethod
	readonly string: PrototypeRuntimeFieldMethod
}

export type PrototypeFieldDeclaration = (
	field: PrototypeRuntimeFieldBuilder,
) => void

/** Invokes one plugin method that is intentionally unknown before generation. */
export const callPrototypeFieldMethod = (
	field: PrototypeRuntimeFieldBuilder,
	method: string,
	name: string,
	options?: Readonly<Record<string, unknown>>,
): void => {
	const declaration = field[method]

	if (declaration === undefined) {
		throw new TypeError(`Prototype field method is unavailable: ${method}`)
	}

	declaration(name, options)
}

export interface PrototypeSchemaOptions {
	readonly className: string
	readonly fields: PrototypeFieldDeclaration
}

export interface PrototypeModel {
	readonly values: Readonly<Record<string, unknown>>
	readonly toJSON: () => Readonly<Record<string, unknown>>
}

export interface PrototypeSchemaClass {
	new (values: Readonly<Record<string, unknown>>): PrototypeModel
	readonly className: string
	readonly fields: readonly PrototypeCompiledField[]
}

interface PrototypeSchemaDeclaration {
	readonly className: string
	readonly fields: PrototypeFieldDeclaration
}

export interface PrototypeFieldDeclarationRegistry {
	readonly register: (definition: PrototypeFieldMethodDefinition) => void
}

export interface PrototypePlugin {
	readonly declare: (fields: PrototypeFieldDeclarationRegistry) => void
	readonly name: string
}

export interface PrototypeCompiledSchema {
	readonly className: string
	readonly fields: readonly PrototypeCompiledField[]
	readonly schema: PrototypeSchemaClass
}

export interface PrototypeCompiledApplication {
	readonly methods: readonly OwnedPrototypeFieldMethod[]
	readonly schema: (schema: PrototypeSchemaClass) => PrototypeCompiledSchema
	readonly schemas: readonly PrototypeCompiledSchema[]
}

const schemaDeclarations = new WeakMap<
	PrototypeSchemaClass,
	PrototypeSchemaDeclaration
>()
const canonicalSchemas = new WeakMap<
	PrototypeSchemaClass,
	PrototypeCompiledSchema
>()

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const isNonEmptyStringArray = (value: unknown): value is readonly string[] =>
	Array.isArray(value) &&
	value.length > 0 &&
	value.every((entry: unknown) => typeof entry === 'string')

const isSchemaTarget = (value: unknown): value is () => unknown =>
	typeof value === 'function'

const assertName = (value: unknown, path: string): string => {
	if (typeof value !== 'string' || value.length === 0) {
		throw new TypeError(`${path} must be a non-empty string`)
	}

	return value
}

const normalizeOptions = (
	value: Readonly<Record<string, unknown>> | undefined,
	path: string,
): Readonly<Record<string, unknown>> => {
	if (value === undefined) return Object.freeze({})
	if (!isRecord(value)) throw new TypeError(`${path} must be an object`)

	return value
}

const isRequired = (options: Readonly<Record<string, unknown>>): boolean => {
	const validation = options.validation

	return isRecord(validation) && validation.required === true
}

const immutableField = (
	field: PrototypeCompiledField,
): PrototypeCompiledField => Object.freeze(field)

const immutableFields = (
	fields: readonly PrototypeCompiledField[],
): readonly PrototypeCompiledField[] => Object.freeze([...fields])

const typeNodeSignature = (node: PrototypeTypeNode): unknown => {
	switch (node.kind) {
		case 'object':
			return {
				fields: node.fields.map(fieldSignature),
				kind: node.kind,
			}
		case 'enum':
			return { kind: node.kind, values: node.values }
		case 'pointer':
		case 'relation':
			return { kind: node.kind, target: node.target }
		default:
			return { kind: node.kind }
	}
}

const fieldSignature = (field: PrototypeCompiledField): unknown => ({
	method: field.method,
	name: field.name,
	owner: field.owner,
	path: field.path,
	required: field.required,
	value: typeNodeSignature(field.value),
})

const compiledSignature = (schema: PrototypeCompiledSchema): string =>
	JSON.stringify({
		className: schema.className,
		fields: schema.fields.map(fieldSignature),
	})

/** Records a schema callback without resolving it during module evaluation. */
export const definePrototypeSchema = (
	options: PrototypeSchemaOptions,
): PrototypeSchemaClass => {
	const className = assertName(options.className, 'Schema className')

	if (typeof options.fields !== 'function') {
		throw new TypeError(`${className} fields must be a function`)
	}

	class PrototypeModelClass implements PrototypeModel {
		readonly values: Readonly<Record<string, unknown>>

		constructor(values: Readonly<Record<string, unknown>>) {
			const compiled = canonicalSchemas.get(PrototypeModelClass)

			if (compiled === undefined) {
				throw new TypeError(
					`${className} fields are unresolved; compile the application before constructing a model`,
				)
			}

			if (!isRecord(values)) {
				throw new TypeError(`${className} model values must be an object`)
			}

			const knownFields = new Set(
				compiled.fields
					.filter(({ value }) => value.kind !== 'relation')
					.map(({ name }) => name),
			)
			const unknownField = Object.keys(values).find(
				(name) => !knownFields.has(name),
			)

			if (unknownField !== undefined) {
				throw new TypeError(`Unknown ${className} field: ${unknownField}`)
			}

			this.values = Object.freeze({ ...values })
			Object.freeze(this)
		}

		static get className(): string {
			return className
		}

		static get fields(): readonly PrototypeCompiledField[] {
			const compiled = canonicalSchemas.get(PrototypeModelClass)

			if (compiled === undefined) {
				throw new TypeError(
					`${className} fields are unresolved; compile the application first`,
				)
			}

			return compiled.fields
		}

		toJSON = (): Readonly<Record<string, unknown>> => this.values
	}

	const schema = PrototypeModelClass as PrototypeSchemaClass
	schemaDeclarations.set(
		schema,
		Object.freeze({ className, fields: options.fields }),
	)
	Object.freeze(schema)

	return schema
}

const assertTarget = (value: unknown, path: string): PrototypeSchemaClass => {
	if (
		typeof value !== 'function' ||
		!schemaDeclarations.has(value as PrototypeSchemaClass)
	) {
		throw new TypeError(`${path} must return a prototype schema`)
	}

	return value as PrototypeSchemaClass
}

class PrototypeMethodRegistry {
	readonly #methods = new Map<string, OwnedPrototypeFieldMethod>()

	forOwner(owner: string): PrototypeFieldDeclarationRegistry {
		const normalizedOwner = assertName(owner, 'Plugin name')

		return Object.freeze({
			register: (definition: PrototypeFieldMethodDefinition): void => {
				const name = assertName(definition.name, 'Field method name')
				const existing = this.#methods.get(name)

				if (existing !== undefined) {
					throw new TypeError(
						`Field method ${name} from ${normalizedOwner} conflicts with ${existing.owner}`,
					)
				}

				if (typeof definition.create !== 'function') {
					throw new TypeError(`Field method ${name} requires a factory`)
				}

				this.#methods.set(
					name,
					Object.freeze({ ...definition, name, owner: normalizedOwner }),
				)
			},
		})
	}

	get(name: string): OwnedPrototypeFieldMethod | undefined {
		return this.#methods.get(name)
	}

	values(): readonly OwnedPrototypeFieldMethod[] {
		return Object.freeze([...this.#methods.values()])
	}
}

const freezeMethod = (
	definition: PrototypeFieldMethodDefinition,
): PrototypeFieldMethodDefinition => Object.freeze(definition)

const simpleMethod = (
	name: string,
	value: PrototypeTypeNode,
): PrototypeFieldMethodDefinition => {
	const definition: PrototypeFieldMethodDefinition = {
		create: ({ options }) => ({ required: isRequired(options), value }),
		name,
		typegen: Object.freeze({ options: Object.freeze([]), value }),
	}

	return freezeMethod(definition)
}

const registerCoreMethods = (registry: PrototypeMethodRegistry): void => {
	const core = registry.forOwner('@ultimabase/core')
	core.register(simpleMethod('string', Object.freeze({ kind: 'string' })))
	core.register(simpleMethod('boolean', Object.freeze({ kind: 'boolean' })))
	core.register(
		freezeMethod({
			create: ({ options, path }) => {
				const values = options.values

				if (!isNonEmptyStringArray(values)) {
					throw new TypeError(`${path} enum values must be non-empty strings`)
				}

				return {
					required: isRequired(options),
					value: Object.freeze({
						kind: 'enum' as const,
						values: Object.freeze([...values]),
					}),
				}
			},
			name: 'enum',
			typegen: Object.freeze({
				options: Object.freeze([]),
				value: Object.freeze({ kind: 'enum', values: Object.freeze([]) }),
			}),
		}),
	)
	core.register(
		freezeMethod({
			create: ({ buildNested, options, path }) => {
				const declaration = options.fields

				if (typeof declaration !== 'function') {
					throw new TypeError(`${path} object fields must be a function`)
				}

				return {
					required: isRequired(options),
					value: Object.freeze({
						fields: buildNested(declaration as PrototypeFieldDeclaration, path),
						kind: 'object' as const,
					}),
				}
			},
			name: 'object',
			typegen: Object.freeze({
				options: Object.freeze([]),
				value: Object.freeze({
					fields: Object.freeze([]),
					kind: 'object',
				}),
			}),
		}),
	)

	for (const name of ['pointer', 'relation'] as const) {
		core.register(
			freezeMethod({
				create: ({ options, path }) => {
					const target = options.target

					if (!isSchemaTarget(target)) {
						throw new TypeError(`${path} ${name} target must be a function`)
					}

					const targetSchema = assertTarget(target(), `${path} ${name} target`)

					return {
						required: isRequired(options),
						value: Object.freeze({
							kind: name,
							target: targetSchema.className,
						}),
					}
				},
				name,
				typegen: Object.freeze({
					options: Object.freeze([]),
					value: Object.freeze({ kind: name, target: '' }),
				}),
			}),
		)
	}
}

/** Creates the plugin used to prove one generated `field.vector()` method. */
export const prototypeVectorPlugin = (
	pluginName = '@ultimabase/pg-vector-plugin',
): PrototypePlugin => {
	const plugin: PrototypePlugin = {
		declare: (fields) => {
			fields.register(
				freezeMethod({
					create: ({ options, path }) => {
						const dimensions = options.dimensions

						if (
							typeof dimensions !== 'number' ||
							!Number.isSafeInteger(dimensions) ||
							dimensions < 1
						) {
							throw new TypeError(
								`${path} vector dimensions must be a positive safe integer`,
							)
						}

						return {
							required: isRequired(options),
							value: Object.freeze({ kind: 'readonly-number-array' }),
						}
					},
					name: 'vector',
					typegen: Object.freeze({
						options: Object.freeze([
							Object.freeze({
								name: 'dimensions',
								required: true,
								type: 'number' as const,
							}),
						]),
						value: Object.freeze({ kind: 'readonly-number-array' }),
					}),
				}),
			)
		},
		name: pluginName,
	}

	return Object.freeze(plugin)
}

const resolveFields = (
	declaration: PrototypeFieldDeclaration,
	registry: PrototypeMethodRegistry,
	rootPath: string,
): readonly PrototypeCompiledField[] => {
	const fields: PrototypeCompiledField[] = []
	const names = new Set<string>()
	const buildNested = (
		nestedDeclaration: PrototypeFieldDeclaration,
		path: string,
	): readonly PrototypeCompiledField[] =>
		resolveFields(nestedDeclaration, registry, path)
	const builder = new Proxy(
		Object.create(null) as PrototypeRuntimeFieldBuilder,
		{
			get: (_target, property): unknown => {
				if (typeof property !== 'string') return undefined

				return (
					nameValue: string,
					optionsValue?: Readonly<Record<string, unknown>>,
				): void => {
					const name = assertName(nameValue, `${rootPath} field name`)
					const path = `${rootPath}.${name}`
					const method = registry.get(property)

					if (method === undefined) {
						throw new TypeError(
							`${path} uses field method ${property}, but no configured plugin declared it`,
						)
					}

					if (names.has(name)) {
						throw new TypeError(`Duplicate field: ${path}`)
					}

					const options = normalizeOptions(optionsValue, `${path} options`)
					const created = method.create({
						buildNested,
						method: property,
						name,
						options,
						owner: method.owner,
						path,
					})

					names.add(name)
					fields.push(
						immutableField({
							...created,
							method: property,
							name,
							owner: method.owner,
							path,
						}),
					)
				}
			},
		},
	)

	declaration(builder)

	return immutableFields(fields)
}

/** Runs pure plugin declarations before resolving every deferred schema. */
export const compilePrototypeApplication = (options: {
	readonly plugins: readonly PrototypePlugin[]
	readonly schemas: readonly PrototypeSchemaClass[]
}): PrototypeCompiledApplication => {
	const registry = new PrototypeMethodRegistry()
	registerCoreMethods(registry)

	for (const plugin of options.plugins) {
		plugin.declare(registry.forOwner(plugin.name))
	}

	const schemas = options.schemas.map((schema): PrototypeCompiledSchema => {
		const declaration = schemaDeclarations.get(schema)

		if (declaration === undefined) {
			throw new TypeError('Application schema was not created by the prototype')
		}

		const compiled = Object.freeze({
			className: declaration.className,
			fields: resolveFields(
				declaration.fields,
				registry,
				declaration.className,
			),
			schema,
		})
		const canonical = canonicalSchemas.get(schema)

		if (canonical === undefined) {
			canonicalSchemas.set(schema, compiled)
		} else if (compiledSignature(canonical) !== compiledSignature(compiled)) {
			throw new TypeError(
				`${declaration.className} compiled differently in another application`,
			)
		}

		return compiled
	})
	const schemasByIdentity = new Map(
		schemas.map((schema) => [schema.schema, schema] as const),
	)

	return Object.freeze({
		methods: registry.values(),
		schema: (schema: PrototypeSchemaClass): PrototypeCompiledSchema => {
			const compiled = schemasByIdentity.get(schema)

			if (compiled === undefined) {
				throw new TypeError(
					`${schema.className} does not belong to this compiled application`,
				)
			}

			return compiled
		},
		schemas: Object.freeze(schemas),
	})
}
