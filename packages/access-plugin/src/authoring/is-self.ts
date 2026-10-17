import type { SchemaDefinition } from '@ultimabase/core'

import type { AccessRuleResult, SchemaWhereAccessInput } from './contracts.js'

/**
 * Matches the row of the current principal when the principal points to this
 * schema, such as the signed-in User reading its own profile; otherwise it
 * denies, like `false` (ADR-0341).
 *
 * @example `.with({ access: { read: isSelf, update: isSelf } })`
 */
export function isSelf<TSchema extends SchemaDefinition>(
	input: SchemaWhereAccessInput<TSchema>,
): AccessRuleResult<TSchema>
// One implementation serves every schema: `id` is a field of each, which the
// generic where builder cannot prove for an unknown schema.
export function isSelf({
	principal,
	schema,
	where,
}: SchemaWhereAccessInput<SchemaDefinition>): AccessRuleResult<SchemaDefinition> {
	return principal?.toJSON().className === schema
		? where.eq('id', principal.id)
		: false
}
