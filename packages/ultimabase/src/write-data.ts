// A write's `data` before its hooks (D-67): checked for shape, then given
// its defaults, its types checked and its values validated (D-23, D-53).
import type { ScalarType } from './adapter.ts'
import type { Issue } from './errors.ts'
import { InvalidQuery, PublicError } from './errors.ts'
import type { Caller } from './rules.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import type { Models } from './query-where.ts'
import {
	clean,
	entries,
	isInteger,
	isJson,
	isObject,
	storedDate,
	unknownKey,
} from './query-where.ts'
import { checked, validated } from './validation.ts'

/** The data a `before*` hook changes in place (D-71). */
export type Draft = { [field: string]: unknown }

type Scalar = Extract<FieldInfo, { readonly kind: 'scalar' }>

const range = 'from -2,147,483,648 to 2,147,483,647'

/** Each scalar type's check, and its message when a value does not fit. */
const fits: {
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
	number: (value, field) => {
		if (field.integer !== true) {
			return typeof value === 'number' && Number.isFinite(value)
				? undefined
				: 'Expected a finite number.'
		}
		return isInteger(value) ? undefined : `Expected a whole number ${range}.`
	},
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
}

/** A value's issue; each element of a list fits its type (D-127). */
export function issueOf(value: unknown, field: Scalar): string | undefined {
	if (!field.list) return fits[field.type](value, field)
	const fit = (item: unknown) =>
		item !== '' && fits[field.type](item, field) === undefined
	if (Array.isArray(value) && value.every(fit)) return undefined
	const of =
		field.type === 'enum'
			? `values among ${(field.values ?? []).join(', ')}`
			: field.integer === true
				? `whole numbers ${range}`
				: field.type === 'number'
					? 'finite numbers'
					: 'non-empty strings without a NUL or a lone surrogate'
	return `Expected a list of ${of}.`
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

const allowed = (creating: boolean): readonly string[] =>
	creating ? ['connect', 'create'] : ['connect', 'create', 'disconnect']

function operations(
	value: unknown,
	path: string,
	model: string,
	creating: boolean,
): Map<string, unknown> {
	if (value === null) {
		throw new InvalidQuery(path, `${path} cannot be null; use disconnect.`)
	}
	const given = new Map(entries(value, path))
	for (const key of given.keys()) {
		if (!allowed(creating).includes(key))
			throw unknownKey(`${path}.${key}`, model)
	}
	return given
}

/** Data a nested `create` makes a row from (D-128). */
function made(value: unknown, path: string): Draft {
	if (!isObject(value)) {
		throw new InvalidQuery(path, `${path} must be an object.`)
	}
	return value
}

/**
 * A `one` relation write: the target's id, the data of the row it creates,
 * or `undefined` to disconnect.
 */
export function oneWrite(
	value: unknown,
	path: string,
	model: string,
	creating: boolean,
): string | Draft | undefined {
	const given = operations(value, path, model, creating)
	if (given.size !== 1) {
		throw new InvalidQuery(
			path,
			`${path} takes one of ${allowed(creating).join(', ')}.`,
		)
	}
	const connect = given.get('connect')
	if (connect !== undefined) return ref(connect, `${path}.connect`)
	const create = given.get('create')
	if (create !== undefined) return made(create, `${path}.create`)
	if (given.get('disconnect') !== true) {
		throw new InvalidQuery(
			`${path}.disconnect`,
			`${path}.disconnect must be true.`,
		)
	}
	return undefined
}

/** A `many` relation write: the ids it connects and disconnects, the rows it creates. */
export function manyWrite(
	value: unknown,
	path: string,
	model: string,
	creating: boolean,
): {
	readonly connect: string[]
	readonly disconnect: string[]
	readonly create: Draft[]
} {
	const given = operations(value, path, model, creating)
	const list = (key: string): string[] =>
		given.has(key) ? refs(given.get(key), `${path}.${key}`) : []
	const create = given.get('create') ?? []
	if (!Array.isArray(create)) {
		throw new InvalidQuery(`${path}.create`, `${path}.create must be a list.`)
	}
	return {
		connect: list('connect'),
		disconnect: list('disconnect'),
		create: create.map((item: unknown, index) =>
			made(item, `${path}.create.${index}`),
		),
	}
}

/**
 * The caller's data, its shape checked, as a draft the hooks may change: a
 * copy, down to the rows it creates, which never write the relation they are
 * created through (D-128).
 */
export function readData(
	models: Models,
	model: ModelInfo,
	data: unknown,
	creating: boolean,
	at = 'data',
	inverse?: string,
): Draft {
	const draft: Draft = {}
	for (const [name, value] of entries(data, at)) {
		const field = model.fields.get(name)
		const path = `${at}.${name}`
		if (field === undefined) throw unknownKey(path, model.name)
		if (name === inverse) {
			throw new InvalidQuery(
				path,
				`${path} cannot be written: it links to the row being written.`,
			)
		}
		draft[name] = value
		if (field.kind === 'scalar') continue
		const target = models.get(field.target)
		const nested = (item: Draft, index?: number): Draft =>
			target === undefined
				? item
				: readData(
						models,
						target,
						item,
						true,
						`${path}.create${index === undefined ? '' : `.${index}`}`,
						field.inverse,
					)
		if (field.kind === 'one') {
			const write = oneWrite(value, path, model.name, creating)
			if (isObject(write)) draft[name] = { create: nested(write) }
			continue
		}
		const write = manyWrite(value, path, model.name, creating)
		if (isObject(value) && Object.hasOwn(value, 'create')) {
			draft[name] = { ...value, create: write.create.map(nested) }
		}
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
	at: readonly (string | number)[] = [],
): Promise<void> {
	if (creating) defaults(model, draft, caller)
	const issues: Issue[] = []
	for (const [name, value] of Object.entries(draft)) {
		const field = model.fields.get(name)
		if (field?.kind !== 'scalar' || value === null) continue
		const { codec } = field
		// A plugin field's schema takes the value or its JSON (D-122).
		const issue = codec === undefined ? issueOf(value, field) : undefined
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
	if (issues.length > 0) {
		throw invalid(issues.map((one) => ({ ...one, path: [...at, ...one.path] })))
	}
}

export function invalid(issues: readonly Issue[]): PublicError {
	return new PublicError('VALIDATION_FAILED', 'Invalid data.', {
		details: { issues },
	})
}
