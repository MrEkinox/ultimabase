import {
	FrameworkError,
	type OperationOptions,
	type SchemaDefinition,
} from '@ultimabase/core'

import { roleQuerySchema } from './role-resolution.js'

const masterOptions: OperationOptions = Object.freeze({ useMasterKey: true })

const isUniqueViolation = (error: unknown): boolean =>
	error instanceof FrameworkError && error.code === 'UNIQUE_VIOLATION'

/**
 * Creates the `ensure` roles missing from one role schema (ADR-0322). Existing
 * roles are left unchanged; a role another instance created concurrently
 * counts as present.
 */
export const ensureRoles = async (
	schema: SchemaDefinition,
	names: readonly string[],
): Promise<readonly string[]> => {
	const roles = roleQuerySchema(schema)
	const created: string[] = []
	for (const name of names) {
		const existing = await roles.findOne(
			{ where: { name: { eq: name } }, select: { id: true } },
			masterOptions,
		)
		if (existing !== null) continue
		try {
			await roles.createOne({ data: { name } }, masterOptions)
			created.push(name)
		} catch (error: unknown) {
			if (!isUniqueViolation(error)) throw error
		}
	}
	return created
}
