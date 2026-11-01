// Virtual fields at startup (D-151): each one's output, input and needs
// resolved, with the `run` or `runMany` its model's `.with` gives it.
import type { SchemaField } from './adapter.ts'
import type { ModelDefinition, Output } from './definition.ts'
import { holdsPage, outputOf } from './definition.ts'
import { Refused } from './errors.ts'
import { isObject, systemFields } from './query-where.ts'
import type { Standard } from './validation.ts'
import { standardOf } from './validation.ts'

export type VirtualInfo = {
	readonly name: string
	readonly model: string
	readonly output: Output
	readonly input: Standard | undefined
	/** The scalar fields and stored `one` keys its rule reads, `id` first. */
	readonly needs: readonly string[]
	/** `runMany` takes the rows at once, `run` one by one. */
	readonly many: boolean
	readonly run: (facts: object) => unknown
	/** A value without input is in the row without `select`. */
	readonly default: boolean
	readonly description: string | undefined
}

/** The keys that shape a model output's rows, which no input property takes. */
const shaping = ['select', 'include', 'omit']

/** An input's properties, from its JSON Schema export when it has one. */
function propertiesOf(input: Standard): readonly string[] {
	const exporter: unknown = Reflect.get(input.self, 'jsonSchema')
	const exported = isObject(exporter) ? exporter['input'] : undefined
	if (typeof exported !== 'function') return []
	const node: unknown = Reflect.apply(exported, exporter, [
		{ target: 'draft-2020-12' },
	])
	const properties = isObject(node) ? node['properties'] : undefined
	return isObject(properties) ? Object.keys(properties) : []
}

function outputFor(value: unknown, where: string): Output {
	const standard = standardOf(value)
	if (standard !== undefined) return { kind: 'schema', schema: standard.schema }
	if (typeof value !== 'function') {
		throw new Refused(
			`${where} is a Standard Schema, or a model or a type behind an arrow.`,
		)
	}
	const returned: unknown = Reflect.apply(value, undefined, [])
	const output = outputOf(returned, where)
	if (!holdsPage(output)) return output
	throw new Refused(`${where} is a virtual, which returns no page.`)
}

function ruleOf(
	given: { readonly [key: string]: unknown },
	where: string,
): { readonly many: boolean; readonly run: (facts: object) => unknown } {
	const rule = given[where.slice(where.indexOf('.') + 1)]
	if (!isObject(rule)) {
		throw new Refused(
			`${where} is virtual; give its run or runMany in .with({ virtuals }).`,
		)
	}
	const { run, runMany } = rule
	if ((typeof run === 'function') === (typeof runMany === 'function')) {
		throw new Refused(`${where}: give run or runMany, one of them.`)
	}
	const chosen = typeof run === 'function' ? run : runMany
	if (typeof chosen !== 'function') throw new TypeError('A rule is a function.')
	return {
		many: chosen === runMany,
		run: (facts) => {
			const value: unknown = Reflect.apply(chosen, rule, [facts])
			return value
		},
	}
}

/** Whether a virtual may need `name`: a scalar, or a stored key (D-184). */
function readable(
	fields: ReadonlyMap<string, SchemaField>,
	name: unknown,
): boolean {
	if (typeof name !== 'string') return false
	const field = fields.get(name)
	return (
		systemFields.includes(name) ||
		field?.kind === 'scalar' ||
		(field?.kind === 'one' && field.stored)
	)
}

/** The virtual fields of a model, checked against its fields and models. */
export function virtualsOf(
	model: string,
	definition: ModelDefinition,
	fields: ReadonlyMap<string, SchemaField>,
	models: ReadonlyMap<object, string>,
): ReadonlyMap<string, VirtualInfo> {
	const rules = isObject(definition.rules)
		? definition.rules['virtuals']
		: undefined
	const given = isObject(rules) ? rules : {}
	const virtuals = new Map<string, VirtualInfo>()
	for (const name of Object.keys(given)) {
		if (definition.fields.get(name)?.kind !== 'virtual') {
			throw new Refused(`${model}.virtuals.${name} names no virtual field.`)
		}
	}
	for (const [name, field] of definition.fields) {
		if (field.kind !== 'virtual') continue
		const where = `${model}.${name}`
		const output = outputFor(field.output, where)
		if (output.kind === 'model' && !models.has(output.value)) {
			throw new Refused(`${where}: its output model is not in models.`)
		}
		const { input: schema, needs: listed, description } = field.options
		const input = schema === undefined ? undefined : standardOf(schema)
		if (schema !== undefined && input === undefined) {
			throw new Refused(`${where}: input is a Standard Schema of an object.`)
		}
		for (const key of input === undefined ? [] : propertiesOf(input)) {
			if (shaping.includes(key)) {
				throw new Refused(
					`${where}: no input property is named ${key}, which shapes a model's rows.`,
				)
			}
		}
		const needs: readonly unknown[] = Array.isArray(listed) ? listed : []
		for (const need of needs) {
			if (!readable(fields, need)) {
				throw new Refused(
					`${where} needs ${String(need)}, neither a scalar field nor a one relation the row stores.`,
				)
			}
		}
		virtuals.set(name, {
			name,
			model,
			output,
			input,
			needs: [...new Set(['id', ...needs.map(String)])],
			...ruleOf(given, where),
			default: output.kind === 'schema' && input === undefined,
			description: typeof description === 'string' ? description : undefined,
		})
	}
	return virtuals
}
