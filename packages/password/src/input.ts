// The functions' inputs (D-109, D-113): Standard Schemas written here, each
// with the JSON Schema a transport types its arguments from (D-45).
import type { SchemaField } from 'ultimabase'
import { PublicError } from 'ultimabase'

type Node = { readonly [key: string]: unknown }
type Read = { readonly value: unknown } | { readonly message: string }
type Issue = { readonly path: readonly string[]; readonly message: string }
type Scalar = Extract<SchemaField, { readonly kind: 'scalar' }>
type Result<O> = { readonly value: O } | { readonly issues: readonly Issue[] }

/** Standard Schema with its JSON Schema export (standardschema.dev), copied as its specification asks. */
interface StandardSchema<I, O> {
	readonly '~standard': {
		readonly version: 1
		readonly vendor: string
		readonly validate: (value: unknown) => Result<O>
		readonly jsonSchema: {
			readonly input: () => Node
			readonly output: () => Node
		}
		readonly types?: { readonly input: I; readonly output: O }
	}
}

/** One property of an input: how it reads a value, and its JSON Schema. */
export interface Property {
	readonly read: (value: unknown) => Read
	readonly json: Node
	readonly required: boolean
}

const isObject = (value: unknown): value is Node =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): Read =>
	typeof value === 'string' ? { value } : { message: 'Expected a string.' }

/** The email trimmed and lowercased, the account's subject (D-113). */
export function emailOf(value: unknown): Read {
	if (typeof value !== 'string') return { message: 'Expected a string.' }
	const email = value.trim().toLowerCase()
	if (email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) {
		return { message: 'Expected an email address.' }
	}
	return { value: email }
}

/** A password to store: 8 to 256 characters, no other rule (D-113). */
export function passwordOf(value: unknown): Read {
	if (typeof value !== 'string') return { message: 'Expected a string.' }
	const length = Array.from(value).length
	if (length < 8 || length > 256) {
		return { message: 'A password has 8 to 256 characters.' }
	}
	return { value }
}

/** `read`'s value, or a `VALIDATION_FAILED` naming `path`. */
export function valid<T>(
	read: (value: unknown) => Read,
	value: T,
	path: string,
): T {
	const result = read(value)
	if ('message' in result) {
		const issues = [{ path: [path], message: result.message }]
		throw new PublicError('VALIDATION_FAILED', `${path}: ${result.message}`, {
			details: { issues },
		})
	}
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- emailOf and passwordOf return the string they were given, normalized.
	return result.value as T
}

/** A property of `read`, whose JSON Schema is `json`. */
export const property = (
	read: Property['read'],
	json: Node,
	required = true,
): Property => ({ read, json, required })

/** Each scalar type's check and JSON Schema, with `null` when optional. */
function readOf(field: Scalar): Property['read'] {
	const { type, values = [] } = field
	return (value) => {
		if (value === null && field.optional) return { value }
		if (type === 'number') {
			return typeof value === 'number' && Number.isFinite(value)
				? { value }
				: { message: 'Expected a number.' }
		}
		if (type === 'boolean') {
			return typeof value === 'boolean'
				? { value }
				: { message: 'Expected a boolean.' }
		}
		if (type === 'date') {
			const date =
				value instanceof Date || typeof value === 'string'
					? new Date(value)
					: undefined
			return date === undefined || Number.isNaN(date.getTime())
				? { message: 'Expected a date.' }
				: { value: date }
		}
		if (type === 'enum') {
			return typeof value === 'string' && values.includes(value)
				? { value }
				: { message: `Expected one of ${values.join(', ')}.` }
		}
		return text(value)
	}
}

function jsonOf(field: Scalar): Node {
	const { type, values = [], optional } = field
	const base = type === 'date' || type === 'enum' ? 'string' : type
	return {
		type: optional ? [base, 'null'] : base,
		...(type === 'date' ? { format: 'date-time' } : {}),
		...(type === 'enum' ? { enum: optional ? [...values, null] : values } : {}),
	}
}

/** A user field a client may send at sign-up; a relation or JSON stops startup. */
export function fieldProperty(
	field: SchemaField,
	required: boolean,
	where: string,
): Property {
	if (field.kind !== 'scalar' || field.type === 'json') {
		throw new Error(
			`${where}: ${field.name} is a relation or a JSON field, which sign-up does not take (D-113).`,
		)
	}
	return property(readOf(field), jsonOf(field), required)
}

/** An object of `properties`, which refuses any other key. */
function objectRead(
	properties: ReadonlyMap<string, Property>,
	value: unknown,
	path: readonly string[],
	issues: Issue[],
): Node {
	if (!isObject(value)) {
		issues.push({ path, message: 'Expected an object.' })
		return {}
	}
	const output: { [key: string]: unknown } = {}
	for (const key of Object.keys(value)) {
		if (!properties.has(key)) {
			issues.push({ path: [...path, key], message: 'Unknown field.' })
		}
	}
	for (const [key, { read, required }] of properties) {
		const given = value[key]
		if (given === undefined) {
			if (required) issues.push({ path: [...path, key], message: 'Required.' })
			continue
		}
		const result = read(given)
		if ('message' in result) {
			issues.push({ path: [...path, key], message: result.message })
		} else output[key] = result.value
	}
	return output
}

function objectJson(properties: ReadonlyMap<string, Property>): Node {
	const required = [...properties].filter(([, each]) => each.required)
	return {
		type: 'object',
		properties: Object.fromEntries(
			[...properties].map(([key, each]) => [key, each.json]),
		),
		required: required.map(([key]) => key),
		additionalProperties: false,
	}
}

/** What a named input's `run` reads, under `input` (D-109). */
export type Named<O> = { readonly input: O }

/**
 * One `input` argument of the object `id`, typed `SignUpInput` over GraphQL
 * for the id `SignUp`; the email is normalized, the dates read (D-113).
 */
export function namedInput<O extends object>(
	id: string,
	properties: ReadonlyMap<string, Property>,
): StandardSchema<Named<O>, Named<O>> {
	const json = (): Node => ({
		$schema: 'https://json-schema.org/draft/2020-12/schema',
		type: 'object',
		properties: { input: { $ref: `#/$defs/${id}` } },
		required: ['input'],
		additionalProperties: false,
		$defs: { [id]: objectJson(properties) },
	})
	const validate = (value: unknown) => {
		const issues: Issue[] = []
		const root = isObject(value) ? value : {}
		const input = objectRead(properties, root['input'], ['input'], issues)
		if (!isObject(value))
			issues.push({ path: [], message: 'Expected an object.' })
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- each property of O was read by its check above.
		return issues.length > 0 ? { issues } : { value: { input: input as O } }
	}
	return {
		'~standard': Object.freeze({
			version: 1,
			vendor: 'ultimabase-password',
			validate,
			jsonSchema: { input: json, output: json },
		}),
	}
}

const string = { type: 'string' }
const email = property(emailOf, { type: 'string', format: 'email' })

/** What `signIn` and `User.signIn` take. */
export type Credentials = { readonly email: string; readonly password: string }

type ChangePassword = {
	readonly currentPassword: string
	readonly newPassword: string
}
type SignUp = Credentials & { readonly [field: string]: unknown }

export const signInInput: StandardSchema<
	Named<Credentials>,
	Named<Credentials>
> = namedInput(
	'SignIn',
	new Map([
		['email', email],
		['password', property(text, string)],
	]),
)

export const changePasswordInput: StandardSchema<
	Named<ChangePassword>,
	Named<ChangePassword>
> = namedInput(
	'ChangePassword',
	new Map([
		['currentPassword', property(text, string)],
		['newPassword', property(passwordOf, string)],
	]),
)

/** The email, the password and the listed user fields, by their names. */
export const signUpInput = (
	fields: ReadonlyMap<string, Property>,
): StandardSchema<Named<SignUp>, Named<SignUp>> =>
	namedInput(
		'SignUp',
		new Map([
			['email', email],
			['password', property(passwordOf, string)],
			...fields,
		]),
	)

/** An output's schema: typed and exported, never validated (D-45). */
export function outputSchema<T>(node: Node): StandardSchema<T, T> {
	const json = (): Node => node
	return {
		'~standard': Object.freeze({
			version: 1,
			vendor: 'ultimabase-password',
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an output is typed by its function, never validated (D-45).
			validate: (value: unknown) => ({ value: value as T }),
			jsonSchema: { input: json, output: json },
		}),
	}
}
