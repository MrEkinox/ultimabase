// A write's `data` before its hooks (D-67): checked for shape, then given
// its defaults, its types checked and its values validated (D-23, D-53).
import type { ScalarType } from './adapter.ts'
import type { Issue } from './errors.ts'
import { InvalidQuery, PublicError } from './errors.ts'
import type { Caller } from './rules.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import {
	clean,
	entries,
	isJson,
	isObject,
	listItem,
	storedDate,
	unknownKey,
} from './query-where.ts'
import { checked, validated } from './validation.ts'

/** The data a `before*` hook changes in place (D-71). */
export type Draft = { [field: string]: unknown }

type Scalar = Extract<FieldInfo, { readonly kind: 'scalar' }>

/** Each scalar type's check, and its message when a value does not fit. */
export const fits: {
	readonly [T in ScalarType]: (
		value: unknown,
		field: Scalar,
	) => string | undefined
} = {
	string: (value) => {
		if (typeof value !== 'string') return 'Expected a string.'
		return clean(value)
			? undefined
			: 'Expected a string without a NUL or a lone surrogate.'
	},
	number: (value) =>
		typeof value === 'number' && Number.isFinite(value)
			? undefined
			: 'Expected a finite number.',
	boolean: (value) =>
		typeof value === 'boolean' ? undefined : 'Expected a boolean.',
	date: (value) =>
		storedDate(value) ? undefined : 'Expected a Date of years 1 to 9999.',
	json: (value) =>
		isJson(value)
			? undefined
			: 'Expected JSON data, its strings without a NUL or a lone surrogate.',
	enum: (value, field) =>
		typeof value === 'string' && (field.values ?? []).includes(value)
			? undefined
			: `Expected one of ${(field.values ?? []).join(', ')}.`,
	stringList: (value) =>
		Array.isArray(value) && value.every(listItem)
			? undefined
			: 'Expected a list of non-empty strings without a NUL or a lone surrogate.',
}

/** `{ id }`, exactly. */
function ref(value: unknown, path: string): string {
	const given = entries(value, path)
	const [first] = given
	if (
		given.length !== 1 ||
		first?.[0] !== 'id' ||
		typeof first[1] !== 'string' ||
		!clean(first[1])
	) {
		throw new InvalidQuery(path, `${path} must be { id }.`)
	}
	return first[1]
}

function refs(value: unknown, path: string): string[] {
	if (!Array.isArray(value))
		throw new InvalidQuery(path, `${path} must be a list.`)
	return value.map((item: unknown, index) => ref(item, `${path}.${index}`))
}

function operations(
	value: unknown,
	path: string,
	model: string,
	creating: boolean,
): Map<string, unknown> {
	if (value === null) {
		throw new InvalidQuery(path, `${path} cannot be null; use disconnect.`)
	}
	const allowed = creating ? ['connect'] : ['connect', 'disconnect']
	const given = new Map(entries(value, path))
	for (const key of given.keys()) {
		if (!allowed.includes(key)) throw unknownKey(`${path}.${key}`, model)
	}
	return given
}

/** A `one` relation write: the target's id, `undefined` to disconnect. */
export function oneWrite(
	value: unknown,
	path: string,
	model: string,
	creating: boolean,
): string | undefined {
	const given = operations(value, path, model, creating)
	if (given.size !== 1) {
		throw new InvalidQuery(
			path,
			`${path} takes connect or disconnect, one of them.`,
		)
	}
	const connect = given.get('connect')
	if (connect !== undefined) return ref(connect, `${path}.connect`)
	if (given.get('disconnect') !== true) {
		throw new InvalidQuery(
			`${path}.disconnect`,
			`${path}.disconnect must be true.`,
		)
	}
	return undefined
}

/** A `many` relation write: the ids it connects and disconnects. */
export function manyWrite(
	value: unknown,
	path: string,
	model: string,
	creating: boolean,
): { readonly connect: string[]; readonly disconnect: string[] } {
	const given = operations(value, path, model, creating)
	const list = (key: string): string[] =>
		given.has(key) ? refs(given.get(key), `${path}.${key}`) : []
	return { connect: list('connect'), disconnect: list('disconnect') }
}

/** The caller's data, its shape checked, as a draft the hooks may change. */
export function readData(
	model: ModelInfo,
	data: unknown,
	creating: boolean,
): Draft {
	const draft: Draft = {}
	for (const [name, value] of entries(data, 'data')) {
		const field = model.fields.get(name)
		const path = `data.${name}`
		if (field === undefined) throw unknownKey(path, model.name)
		if (field.kind === 'one') oneWrite(value, path, model.name, creating)
		if (field.kind === 'many') manyWrite(value, path, model.name, creating)
		draft[name] = value
	}
	return draft
}

/** A relation default's id: the target's `{ id }` or a record of it (D-53). */
function idOf(model: ModelInfo, field: FieldInfo, value: unknown): string {
	const id = isObject(value) ? value['id'] : undefined
	if (typeof id !== 'string') {
		throw new TypeError(
			`${model.name}.${field.name}: a relation's default is the target's { id } or a record of it.`,
		)
	}
	return id
}

function defaults(model: ModelInfo, draft: Draft, caller: Caller): void {
	for (const field of model.fields.values()) {
		if (Object.hasOwn(draft, field.name) || field.kind === 'many') continue
		const fallback = field.options['default']
		const value: unknown =
			typeof fallback === 'function'
				? Reflect.apply(fallback, undefined, [{ caller }])
				: fallback
		if (value === undefined) continue
		draft[field.name] =
			field.kind === 'one'
				? { connect: { id: idOf(model, field, value) } }
				: value
	}
}

/**
 * Gives a create its defaults, then checks each value's type and runs its
 * `validate`, whose output replaces it: defaults are validated, hook values
 * are not (D-67).
 */
export async function prepared(
	model: ModelInfo,
	draft: Draft,
	caller: Caller,
	creating: boolean,
): Promise<void> {
	if (creating) defaults(model, draft, caller)
	const issues: Issue[] = []
	for (const [name, value] of Object.entries(draft)) {
		const field = model.fields.get(name)
		if (field?.kind !== 'scalar' || value === null) continue
		const { codec } = field
		// A plugin field's schema takes the value or its JSON (D-122).
		const issue =
			codec === undefined ? fits[field.type](value, field) : undefined
		if (issue !== undefined) {
			issues.push({ path: [name], message: issue })
			continue
		}
		const result =
			codec === undefined
				? await validated(model, field, value)
				: await checked(codec.schema, value, [name], `${model.name}.${name}`)
		if ('issues' in result) issues.push(...result.issues)
		else draft[name] = result.value
	}
	if (issues.length > 0) throw invalid(issues)
}

export function invalid(issues: readonly Issue[]): PublicError {
	return new PublicError('VALIDATION_FAILED', 'Invalid data.', {
		details: { issues },
	})
}
