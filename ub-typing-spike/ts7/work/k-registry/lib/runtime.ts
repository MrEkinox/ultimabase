// Runtime of form K (rules constant + rules list at registration). Untyped against the
// developer's schemas on purpose: it validates `unknown` declarations and exposes what a
// real Runtime would read. Core never names a plugin: rule keys, shape options, added
// fields and schema factories all come from the installed plugin definitions.

export interface RuntimeField {
	readonly kind: string
	readonly options: Readonly<Record<string, unknown>>
}

export type RuntimeFields = Readonly<Record<string, RuntimeField>>

/** Factory of one plugin schema kind (`App.RoleSchema`). */
export interface RuntimeSchemaFactory {
	/** `one`: exactly one registered schema of this factory per application. */
	readonly cardinality: 'one' | 'many'
	/** Turns the factory declaration into an ordinary declaration plus model methods. */
	readonly prepare: (declaration: Readonly<Record<string, unknown>>) => {
		readonly declaration: Readonly<Record<string, unknown>>
		readonly ownedFields: (field: RuntimeFieldBuilder) => RuntimeFields
		readonly model: Readonly<Record<string, (...args: readonly unknown[]) => unknown>>
	}
}

/** Runtime part of one plugin definition. */
export interface RuntimePlugin {
	readonly id: string
	/** Keys this plugin accepts in `Schema.rules({ ... })`. */
	readonly ruleKeys?: readonly string[]
	/** Keys this plugin accepts in `Schema.define({ ... })` (shape options). */
	readonly shapeOptions?: readonly string[]
	/** Fields added from the declared shape options. */
	readonly shapeFields?: (declaration: Readonly<Record<string, unknown>>, field: RuntimeFieldBuilder) => RuntimeFields
	/** Fields added to every schema. */
	readonly fields?: (field: RuntimeFieldBuilder) => RuntimeFields
	readonly factories?: Readonly<Record<string, RuntimeSchemaFactory>>
}

export type RuntimeFieldBuilder = Readonly<Record<string, (...args: readonly unknown[]) => RuntimeField>>

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null

const isField = (value: unknown): value is RuntimeField => isRecord(value) && typeof value['kind'] === 'string' && isRecord(value['options'])

const fieldOf =
	(kind: string) =>
	(...args: readonly unknown[]): RuntimeField => {
		const [first, second] = args
		if (kind === 'list') return { kind, options: { item: first } }
		if (kind === 'enum' && isRecord(first) && isRecord(first['values']) && 'enumName' in first['values']) {
			return { kind, options: { ...first, enumName: first['values']['enumName'], values: first['values']['values'] } }
		}
		return { kind, options: isRecord(first) ? first : isRecord(second) ? second : {} }
	}

export const fieldBuilder: RuntimeFieldBuilder = Object.fromEntries(
	['string', 'int', 'boolean', 'date', 'enum', 'list', 'json', 'pointer', 'relation'].map((kind) => [kind, fieldOf(kind)]),
)

const systemFields: RuntimeFields = {
	id: { kind: 'string', options: { required: true } },
	createdAt: { kind: 'date', options: { required: true } },
	updatedAt: { kind: 'date', options: { required: true } },
}

/** Where the developer called `rules(...)`, for startup messages. */
const callSite = (): string => {
	const line = new Error().stack?.split('\n')[3] ?? ''
	const match = /([^/\s(]+\.[cm]?[jt]s):(\d+)/.exec(line)
	return match ? `${match[1]}:${match[2]}` : 'unknown location'
}

export interface RuntimeSchema {
	readonly className: string
	readonly fields: RuntimeFields
	readonly shape: Readonly<Record<string, unknown>>
	readonly factory: string | undefined
	rules(options: unknown): RuntimeRules
}

/** Value returned by `Todo.rules({...})`: inert data until listed in `new App({ rules })`. */
export interface RuntimeRules {
	readonly schema: RuntimeSchema
	readonly options: Readonly<Record<string, unknown>>
	readonly declaredAt: string
}

export class RegistrationError extends Error {
	override readonly name = 'RegistrationError'
}

/** Every `rules(...)` call, to report rules declared but not registered. */
const declaredRules = new WeakMap<RuntimeSchema, RuntimeRules[]>()

const defineSchema = (
	plugins: readonly RuntimePlugin[],
	input: unknown,
	factory?: { readonly name: string; readonly ownedFields: (field: RuntimeFieldBuilder) => RuntimeFields; readonly model: object },
): RuntimeSchema => {
	if (!isRecord(input) || typeof input['className'] !== 'string') throw new TypeError('Schema.define: className is required')
	const { className, fields: declareFields, ...shape } = input
	const shapeKeys = new Set(plugins.flatMap((plugin) => plugin.shapeOptions ?? []))
	for (const key of Object.keys(shape)) {
		if (!shapeKeys.has(key)) throw new TypeError(`${className}: unknown schema option '${key}' (installed: ${[...shapeKeys].join(', ') || 'none'})`)
	}
	const returned: unknown = typeof declareFields === 'function' ? declareFields(fieldBuilder) : {}
	if (!isRecord(returned)) throw new TypeError(`${className}: fields must return an object`)
	const declared: RuntimeFields = Object.fromEntries(
		Object.entries(returned).map(([name, value]) => {
			if (!isField(value)) throw new TypeError(`${className}.${name}: not a field`)
			return [name, value]
		}),
	)
	const fields: RuntimeFields = Object.freeze(
		Object.fromEntries([
			...Object.entries(systemFields),
			...Object.entries(declared),
			...(factory ? Object.entries(factory.ownedFields(fieldBuilder)) : []),
			...plugins.flatMap((plugin) => Object.entries(plugin.fields?.(fieldBuilder) ?? {})),
			...plugins.flatMap((plugin) => Object.entries(plugin.shapeFields?.(input, fieldBuilder) ?? {})),
		]),
	)
	const ruleKeys = new Set(plugins.flatMap((plugin) => plugin.ruleKeys ?? []))
	const schema: RuntimeSchema = Object.freeze({
		...(factory?.model ?? {}),
		className,
		fields,
		shape: Object.freeze(shape),
		factory: factory?.name,
		rules(options: unknown): RuntimeRules {
			if (!isRecord(options)) throw new TypeError(`${className}.rules: an object is required`)
			for (const key of Object.keys(options)) {
				if (!ruleKeys.has(key)) throw new TypeError(`${className}.rules: unknown rule '${key}' (installed: ${[...ruleKeys].join(', ')})`)
			}
			const rules: RuntimeRules = Object.freeze({ schema, options: Object.freeze({ ...options }), declaredAt: callSite() })
			declaredRules.set(schema, [...(declaredRules.get(schema) ?? []), rules])
			return rules
		},
		findMany: async () => [],
		createOne: async () => ({}),
	})
	return schema
}

const targetOf = (field: RuntimeField): unknown => {
	const target = field.options['target'] ?? field.options['members']
	return typeof target === 'function' ? target() : target
}

/** What the application collected for one schema. */
export interface RuntimeRegistrationEntry {
	readonly schema: RuntimeSchema
	readonly className: string
	readonly fields: Readonly<Record<string, string>>
	readonly shape: Readonly<Record<string, unknown>>
	readonly factory: string | undefined
	readonly rules: Readonly<Record<string, { readonly plugin: string | undefined; readonly value: unknown }>>
}

/** Startup checks and the view a real Runtime would build. */
const register = (plugins: readonly RuntimePlugin[], options: unknown): readonly RuntimeRegistrationEntry[] => {
	if (!isRecord(options) || !Array.isArray(options['schemas'])) throw new RegistrationError('new App: schemas is required')
	const schemas: readonly unknown[] = options['schemas']
	const rules: readonly unknown[] = Array.isArray(options['rules']) ? options['rules'] : []
	const errors: string[] = []
	const byName = new Map<string, RuntimeSchema>()
	const registered = new Set<unknown>(schemas)
	for (const schema of schemas) {
		if (!isRecord(schema) || typeof schema['className'] !== 'string') {
			errors.push(`schemas: ${String(schema)} is not a schema (undefined usually means an import cycle evaluated new App first)`)
			continue
		}
		const runtimeSchema = schema as unknown as RuntimeSchema // validated just above (className); fields come from defineSchema
		if (byName.has(runtimeSchema.className)) errors.push(`${runtimeSchema.className}: two registered schemas share this className`)
		byName.set(runtimeSchema.className, runtimeSchema)
	}
	for (const schema of byName.values()) {
		for (const [name, field] of Object.entries(schema.fields)) {
			if (field.kind !== 'pointer' && field.kind !== 'relation') continue
			const target = targetOf(field)
			if (!registered.has(target)) {
				errors.push(`${schema.className}.${name}: target is not a registered schema`)
				continue
			}
			const mappedBy = field.options['mappedBy']
			if (typeof mappedBy === 'string' && isRecord(target) && isRecord(target['fields']) && !(mappedBy in target['fields'])) {
				errors.push(`${schema.className}.${name}: mappedBy '${mappedBy}' is not a field of ${String(target['className'])}`)
			}
		}
	}
	for (const plugin of plugins) {
		for (const [factoryName, factory] of Object.entries(plugin.factories ?? {})) {
			const made = [...byName.values()].filter((schema) => schema.factory === factoryName)
			if (factory.cardinality === 'one' && made.length !== 1) {
				errors.push(`${factoryName} (plugin '${plugin.id}'): exactly one registered schema expected, got ${made.length}${made.length ? ` (${made.map((s) => s.className).join(', ')})` : ''}`)
			}
		}
	}
	const listed = new Map<RuntimeSchema, RuntimeRules>()
	for (const entry of rules) {
		if (!isRecord(entry) || !isRecord(entry['schema'])) {
			errors.push(`rules: ${String(entry)} is not a rules declaration`)
			continue
		}
		const ruleSet = entry as unknown as RuntimeRules // shape validated above; created by schema.rules()
		const name = ruleSet.schema.className
		if (!registered.has(ruleSet.schema)) errors.push(`rules: rules of ${name} (${ruleSet.declaredAt}) target a schema missing from schemas`)
		else if (listed.has(ruleSet.schema)) errors.push(`rules: ${name} has two rules entries (${listed.get(ruleSet.schema)?.declaredAt}, ${ruleSet.declaredAt})`)
		else listed.set(ruleSet.schema, ruleSet)
	}
	for (const schema of byName.values()) {
		for (const declared of declaredRules.get(schema) ?? []) {
			if (!rules.includes(declared)) errors.push(`rules: ${schema.className}.rules(...) declared at ${declared.declaredAt} is not listed in rules`)
		}
		if (!listed.has(schema) && !(declaredRules.get(schema) ?? []).length) {
			errors.push(`rules: ${schema.className} has no rules entry; register ${schema.className}.rules({}) to declare none`)
		}
	}
	if (errors.length) throw new RegistrationError(`Invalid application:\n- ${errors.join('\n- ')}`)
	const ruleOwners = new Map(plugins.flatMap((plugin) => (plugin.ruleKeys ?? []).map((key) => [key, plugin.id] as const)))
	return [...byName.values()].map((schema) => ({
		schema,
		className: schema.className,
		fields: Object.fromEntries(Object.entries(schema.fields).map(([name, field]) => [name, field.kind])),
		shape: schema.shape,
		factory: schema.factory,
		rules: Object.fromEntries(
			Object.entries(listed.get(schema)?.options ?? {}).map(([key, value]) => [key, { plugin: ruleOwners.get(key), value }]),
		),
	}))
}

export type RuntimeRegistration = readonly RuntimeRegistrationEntry[]

/** Runtime of `UltimaBase.use(...)`: a constructible application class with schema namespaces. */
export const createFactory = (plugins: readonly RuntimePlugin[]): object => {
	class App {
		static use(...added: readonly RuntimePlugin[]): object {
			return createFactory([...plugins, ...added])
		}
		static readonly Schema = { define: (declaration: unknown) => defineSchema(plugins, declaration) }
		readonly registration: RuntimeRegistration
		constructor(options: unknown) {
			this.registration = register(plugins, options)
		}
		async start(): Promise<void> {}
	}
	for (const plugin of plugins) {
		for (const [name, factory] of Object.entries(plugin.factories ?? {})) {
			Object.defineProperty(App, name, {
				value: Object.freeze({
					define: (declaration: unknown) => {
						if (!isRecord(declaration)) throw new TypeError(`${name}.define: an object is required`)
						const prepared = factory.prepare(declaration)
						return defineSchema(plugins, prepared.declaration, { name, ownedFields: prepared.ownedFields, model: prepared.model })
					},
				}),
			})
		}
	}
	return App
}
