// Shared enums (D-150): one name and its values, which every field taking
// it shows as one GraphQL enum and one OpenAPI schema; storage is unchanged.
import { describedBy, enumValues, sharedEnums } from './definition.ts'
import type { Enum } from './fields.ts'

/** A shared enum, frozen, which `f.enumOf` takes in place of its values. */
export function defineEnum<const E extends string>(
	name: string,
	values: readonly E[],
	options: { readonly description?: string } = {},
): Enum<E> {
	if (!/^[A-Z_a-z]\w*$/.test(name) || name.startsWith('__')) {
		throw new Error(
			`defineEnum takes a GraphQL name: letters, digits and _, not ${JSON.stringify(name)}.`,
		)
	}
	const of = `defineEnum(${name})`
	enumValues(values, of)
	const shared: Enum<E> = Object.freeze({
		name,
		values: Object.freeze([...values]),
		description: describedBy(options.description, of),
	})
	sharedEnums.set(shared, shared)
	return shared
}
