// The functions' inputs (D-109, D-113): Standard Schemas written here, each
// with the JSON Schema a transport types its arguments from (D-45).
import type { SchemaField } from 'ultimabase'
import { PublicError, Refused } from 'ultimabase'

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
	/** The shared nodes its JSON Schema refers to, lifted to the root's. */
	readonly defs?: Node
}

const isObject = (value: unknown): value is Node =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): Read =>
	typeof value === 'string' ? { value } : { message: 'Expected a string.' }

/** The email trimmed, lowercased and in NFC, the account's subject (D-113, D-115). */
export function emailOf(value: unknown): Read {
	if (typeof value !== 'string') return { message: 'Expected a string.' }
	const email = value.trim().toLowerCase().normalize('NFC')
	if (email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) {
		return { message: 'Expected an email address.' }
	}
	return { value: email }
}

/** How a password is typed does not change it: NFKC (D-115, NIST SP 800-63B). */
export const normalized = (password: string): string =>
	password.normalize('NFKC')

/** A password to store, normalized: 8 to 256 characters, no other rule (D-113). */
export function passwordOf(value: unknown): Read {
	if (typeof value !== 'string') return { message: 'Expected a string.' }
	const password = normalized(value)
	const length = Array.from(password).length
	if (length < 8 || length > 256) {
		return { message: 'A password has 8 to 256 characters.' }
	}
	return { value: password }
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

const [smallest, largest] = [-2_147_483_648, 2_147_483_647]
const range = 'from -2,147,483,648 to 2,147,483,647'

/** An integer field's values, as the kernel takes them (D-132). */
const whole = (value: unknown): boolean =>
	Number.isInteger(value) &&
	Number(value) >= smallest &&
	Number(value) <= largest

/** One value of a scalar type, an element of a list (D-127). */
function itemRead(field: Scalar): Property['read'] {
	const { type, values = [] } = field
	return (value) => {
		if (field.integer === true) {
			return whole(value)
				? { value }
				: { message: `Expected a whole number ${range}.` }
		}
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

/** A scalar's check, with `null` when optional; a list's checks each element. */
function readOf(field: Scalar): Property['read'] {
	const item = itemRead(field)
	if (!field.list) {
		return (value) =>
			value === null && field.optional ? { value } : item(value)
	}
	const fit = (element: unknown) => element !== '' && 'value' in item(element)
	const of =
		field.type === 'enum'
			? `values among ${(field.values ?? []).join(', ')}`
			: field.integer === true
				? `whole numbers ${range}`
				: field.type === 'number'
					? 'numbers'
					: 'non-empty strings'
	return (value) =>
		Array.isArray(value) && value.every(fit)
			? { value }
			: { message: `Expected a list of ${of}.` }
}

function jsonOf(field: Scalar): Node {
	const { type, values = [], optional } = field
	if (field.list) {
		const items = jsonOf({ ...field, list: false, optional: false })
		return {
			type: 'array',
			items: type === 'string' ? { ...items, minLength: 1 } : items,
		}
	}
	const integer = field.integer === true
	const base =
		type === 'date' || type === 'enum' ? 'string' : integer ? 'integer' : type
	return {
		type: optional ? [base, 'null'] : base,
		...(integer ? { minimum: smallest, maximum: largest } : {}),
		...(type === 'date' ? { format: 'date-time' } : {}),
		...(type === 'enum' ? { enum: optional ? [...values, null] : values } : {}),
	}
}

/** A json field's input JSON Schema, `{}` without an export (D-125). */
function exported(schema: object | undefined): Node {
	const standard: unknown = schema && Reflect.get(schema, '~standard')
	const exporter = isObject(standard) ? standard['jsonSchema'] : undefined
	const input = isObject(exporter) ? exporter['input'] : undefined
	if (typeof input !== 'function') return {}
	try {
		const node: unknown = Reflect.apply(input, exporter, [
			{ target: 'draft-2020-12' },
		])
		return isObject(node) ? node : {}
	} catch {
		// A schema it cannot export takes any JSON value, as a field without one.
		return {}
	}
}

/** A json field: any value read here, its schema run by the kernel (D-125). */
function jsonProperty(
	field: Scalar,
	required: boolean,
	schema: object | undefined,
): Property {
	const { $schema: _, $defs: defs, ...json } = exported(schema)
	const typed = Object.keys(json).length > 0
	return {
		read: (value) => ({ value }),
		json: typed && field.optional ? { anyOf: [json, { type: 'null' }] } : json,
		required,
		...(isObject(defs) ? { defs } : {}),
	}
}

/**
 * A user field a client may send at sign-up, a json one with its `validate`;
 * a relation stops startup (D-113, D-125).
 */
export function fieldProperty(
	field: SchemaField,
	required: boolean,
	where: string,
	schema?: object,
): Property {
	if (field.kind !== 'scalar') {
		throw new Refused(
			`${where}: ${field.name} is a relation, which sign-up does not take.`,
		)
	}
	if (field.type === 'json') return jsonProperty(field, required, schema)
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
		$defs: Object.assign(
			{},
			...[...properties.values()].map((each) => each.defs),
			{ [id]: objectJson(properties) },
		),
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

type ResetPassword = { readonly token: string; readonly password: string }

/** What `requestPasswordReset` takes (D-117). */
export const requestResetInput: StandardSchema<
	Named<{ readonly email: string }>,
	Named<{ readonly email: string }>
> = namedInput('RequestPasswordReset', new Map([['email', email]]))

/** What `resetPassword` takes: the email's token and the new password (D-117). */
export const resetPasswordInput: StandardSchema<
	Named<ResetPassword>,
	Named<ResetPassword>
> = namedInput(
	'ResetPassword',
	new Map([
		['token', property(text, string)],
		['password', property(passwordOf, string)],
	]),
)

/** What `verifyEmail` takes: the email's token (D-117). */
export const verifyEmailInput: StandardSchema<
	Named<{ readonly token: string }>,
	Named<{ readonly token: string }>
> = namedInput('VerifyEmail', new Map([['token', property(text, string)]]))

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
