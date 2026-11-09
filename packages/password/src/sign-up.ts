// The sign-up's fields (D-113): those `passwordPlugin({ signUp })` lists,
// checked at start, and a sign-up's data checked against them.
import type { ExposedModel, Identity } from 'ultimabase'
import { isMaster, PublicError, Refused } from 'ultimabase'
import type { State } from './core.ts'
import type { Property } from './input.ts'
import { fieldProperty } from './input.ts'

const reserved = new Set([
	'id',
	'createdAt',
	'updatedAt',
	'email',
	'password',
	'emailVerified',
	'passwordSetAt',
])

/** The listed fields' properties; an unknown, a reserved or a missing one stops startup. */
export function signUpFields(
	users: ExposedModel,
	listed: readonly string[],
): ReadonlyMap<string, Property> {
	const { name, fields } = users.schema
	const where = `passwordPlugin({ signUp })`
	const properties = new Map<string, Property>()
	for (const field of listed) {
		const found = fields.find((each) => each.name === field)
		if (found === undefined || reserved.has(field)) {
			throw new Refused(
				`${where}: ${name}.${field} is not a field sign-up may take.`,
			)
		}
		properties.set(
			field,
			fieldProperty(
				found,
				users.required.includes(field),
				where,
				users.validators[field],
			),
		)
	}
	const missing = users.required.filter((field) => !properties.has(field))
	if (missing.length > 0) {
		throw new Refused(
			`${where}: ${name} needs ${missing.join(', ')} to be created; list them.`,
		)
	}
	return properties
}

/** A sign-up's data, checked against the list unless the caller is Master. */
export function signUpData(
	state: State,
	data: object,
	caller: Identity = { kind: 'anonymous' },
): object {
	if (isMaster(caller)) return data
	if (state.signUp === false) {
		throw new PublicError('ACCESS_DENIED', 'Sign-up is closed.')
	}
	const { signUp } = state
	const issues = Object.keys(data)
		.filter((key) => !signUp.has(key))
		.map((key) => ({ path: ['data', key], message: 'Unknown field.' }))
	if (issues.length > 0) {
		throw new PublicError(
			'VALIDATION_FAILED',
			'Sign-up takes the listed fields only.',
			{
				details: { issues },
			},
		)
	}
	return data
}
