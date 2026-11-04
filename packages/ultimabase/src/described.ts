// What a definition means and whether clients should stop using it, which
// the transports show and nothing reads (D-150, D-216).
import type { FieldDefinition } from './definition.ts'
import { Refused } from './errors.ts'

/** What a field means, and why clients should stop using it (D-150, D-216). */
export type Described = {
	readonly description?: string
	/** Why clients should stop using it, and what replaces it (D-216). */
	readonly deprecated?: string
}

/**
 * Refuses `deprecated` on a field a create must send (D-216). The message is
 * an object, as OneCheck's.
 */
export type DeprecatedCheck<O> = O extends { readonly deprecated: unknown }
	? O extends
			| { readonly optional: true }
			| { readonly default: unknown }
			| { readonly list: true }
			| { readonly from: string }
		? unknown
		: {
				readonly deprecated: {
					readonly error: 'a create must send this field: make it optional or give it a default'
				}
			}
	: unknown

/** A `description` or a `deprecated` (D-150, D-216): a non-empty string. */
export function describedBy(
	value: unknown,
	of: string,
	key: 'description' | 'deprecated' = 'description',
): string | undefined {
	if (value === undefined) return undefined
	if (typeof value !== 'string' || value === '') {
		throw new Error(`${of}: ${key} is a non-empty string.`)
	}
	return value
}

/** Refuses `deprecated` on the field `at` when a create must send it (D-216). */
export function deprecatable(at: string, field: FieldDefinition): void {
	const { kind, options } = field
	if (options['deprecated'] === undefined) return
	if (kind === 'many' || kind === 'exists' || kind === 'virtual') return
	if (
		options['optional'] !== true &&
		options['default'] === undefined &&
		options['list'] !== true
	) {
		throw new Refused(
			`${at}: a create must send it, so it is not deprecated. Make it optional or give it a default.`,
		)
	}
}
