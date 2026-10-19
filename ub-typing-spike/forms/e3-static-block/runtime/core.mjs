// Minimal runtime stub of the class-family Core (form E3: `static { this.access({...}) }`, sealed at registration).
// Proves the form is implementable: base classes from `App.Schema(...)`, shape methods,
// plugin factories, and registration that collects fields and every plugin rule.
// The fixture's TypeScript files run unchanged against it (node strips the types;
// runtime/loader.mjs redirects `lib/core.ts` and `lib/plugins.ts` here).

const fieldBuilder = Object.freeze({
	string: (options = {}) => ({ kind: 'string', ...options }),
	int: (options = {}) => ({ kind: 'int', ...options }),
	boolean: (options = {}) => ({ kind: 'boolean', ...options }),
	date: (options = {}) => ({ kind: 'date', ...options }),
	enum: (options) => ({ ...options, kind: options.list === true ? 'enumList' : 'enum', values: Array.isArray(options.values) ? options.values : options.values.values }),
	pointer: (options) => ({ kind: 'pointer', ...options }),
	relation: (options) => ({ kind: 'relation', ...options }),
})

export const defineEnum = (name, values) => Object.freeze({ name, values: Object.freeze([...values]) })

const systemFields = { id: { kind: 'string', required: true }, createdAt: { kind: 'date', required: true }, updatedAt: { kind: 'date', required: true } }

const unsupported = () => {
	throw new Error('runtime stub: queries are not implemented')
}

// Base statics are defined on the base class itself; the class body's own statics are
// therefore the subclass's own properties, which registration inspects.
const baseKey = Symbol('ultimabase.base')

/** Creates one base class; `shape` lists the shape methods already applied. */
const createBase = (plugins, className, declare, extra = {}) => {
	const declared = declare(fieldBuilder)
	const shapeFields = Object.assign({}, ...(extra.shapeFields ?? []))
	const pluginFields = Object.assign({}, ...plugins.map((plugin) => plugin.fields ?? {}))
	const fields = Object.freeze({ ...declared, ...systemFields, ...pluginFields, ...shapeFields })
	class SchemaBase {}
	Object.defineProperties(SchemaBase, {
		className: { value: className },
		'~fields': { value: fields },
		'~factory': { value: extra.factory },
		[baseKey]: { value: true },
		findMany: { value: unsupported },
		findOne: { value: unsupported },
		createOne: { value: unsupported },
	})
	for (const [name, method] of Object.entries(extra.statics ?? {})) Object.defineProperty(SchemaBase, name, { value: method })
	// One rule method per installed plugin option; `this` is the class whose static block calls it.
	for (const plugin of plugins) {
		for (const key of plugin.optionKeys ?? []) {
			Object.defineProperty(SchemaBase, key, {
				value: function (options) {
					if (sealed.has(this)) throw new TypeError(`${this.className}: rules are sealed after registration (${key})`)
					const rules = rulesBySchema.get(this) ?? new Map()
					if (rules.has(key)) throw new TypeError(`${this.className}: ${key} rules are already declared`)
					rulesBySchema.set(this, rules.set(key, options))
				},
			})
		}
	}
	const used = extra.usedShapes ?? []
	for (const plugin of plugins) {
		for (const [name, addFields] of Object.entries(plugin.shapeMethods ?? {})) {
			if (used.includes(name)) continue
			Object.defineProperty(SchemaBase, name, {
				value: (...args) =>
					createBase(plugins, className, declare, { ...extra, usedShapes: [...used, name], shapeFields: [...(extra.shapeFields ?? []), addFields(...args)] }),
			})
		}
	}
	return SchemaBase
}

const rulesBySchema = new WeakMap()
const sealed = new WeakSet()

/** Rules of one schema class in this form: what its static block declared. */
const rulesOf = (schema) => Object.fromEntries(rulesBySchema.get(schema) ?? new Map())

const allowedOwnStatics = new Set(['length', 'name', 'prototype'])

const describeField = (name, field, plugins) => {
	const target = typeof field.target === 'function' ? field.target().className : undefined
	const fieldRules = plugins.flatMap((plugin) =>
		(plugin.fieldOptionKeys ?? []).filter((key) => field[key] !== undefined).map((key) => `${plugin.id}:${key}.${Object.keys(field[key]).join('+')}`),
	)
	return `${name}:${field.kind}${target ? `->${target}` : ''}${field.mappedBy ? `(mappedBy ${field.mappedBy})` : ''}${fieldRules.length > 0 ? ` [${fieldRules.join(', ')}]` : ''}`
}

const register = (plugins, schemas) => {
	const issues = []
	const optionOwners = new Map(plugins.flatMap((plugin) => (plugin.optionKeys ?? []).map((key) => [key, plugin.id])))
	const factories = plugins.flatMap((plugin) => Object.keys(plugin.factories ?? {}))
	for (const schema of schemas) {
		const base = Object.getPrototypeOf(schema)
		if (base?.[baseKey] !== true) issues.push(`${schema.name}: does not extend App.Schema(...) directly`)
		const customStatics = Object.getOwnPropertyNames(schema).filter((key) => !allowedOwnStatics.has(key))
		const customMembers = Object.getOwnPropertyNames(schema.prototype).filter((key) => key !== 'constructor')
		for (const key of customStatics) issues.push(`${schema.className}: custom static member '${key}' is not allowed`)
		for (const key of customMembers) issues.push(`${schema.className}: custom instance member '${key}' is not allowed`)
		for (const key of Object.keys(rulesOf(schema))) if (!optionOwners.has(key)) issues.push(`${schema.className}: no installed plugin owns rule '${key}'`)
		for (const [name, field] of Object.entries(schema['~fields'])) {
			if (field.kind !== 'relation' || field.mappedBy === undefined) continue
			const target = field.target()
			if (!(field.mappedBy in target['~fields'])) issues.push(`${schema.className}.${name}: mappedBy '${field.mappedBy}' is not a field of ${target.className}`)
		}
	}
	for (const factory of factories) {
		const count = schemas.filter((schema) => schema['~factory'] === factory).length
		if (count !== 1) issues.push(`factory '${factory}' must create exactly one registered schema (found ${count})`)
	}
	if (issues.length > 0) throw new TypeError(`Invalid schemas:\n- ${issues.join('\n- ')}`)
	const collected = schemas.map((schema) => {
		const rules = rulesOf(schema)
		sealed.add(schema) // sealed: rule methods now throw
		Object.freeze(schema)
		return {
			className: schema.className,
			factory: schema['~factory'],
			fields: Object.entries(schema['~fields']).map(([name, field]) => describeField(name, field, plugins)),
			rules: Object.fromEntries(Object.entries(rules).map(([key, value]) => [`${optionOwners.get(key)}:${key}`, Object.keys(value)])),
		}
	})
	return Object.freeze(collected)
}

const makeFactory = (plugins) => {
	class Application {
		constructor(options) {
			this.schemas = options.schemas
			this.registered = register(plugins, options.schemas)
			Object.freeze(this)
		}
	}
	const statics = {
		use: (...more) => makeFactory([...plugins, ...more]),
		Schema: (className, fields) => createBase(plugins, className, fields),
	}
	const core = { createBase: (className, fields, extra) => createBase(plugins, className, fields, extra) }
	for (const plugin of plugins) for (const [name, factory] of Object.entries(plugin.factories ?? {})) statics[name] = factory(core)
	for (const [name, value] of Object.entries(statics)) Object.defineProperty(Application, name, { value })
	return Object.freeze(Application)
}

export const UltimaBase = makeFactory([])
