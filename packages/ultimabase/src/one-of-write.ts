// A `oneOf` in a write's plan (D-247): the hidden `one` of its kind written
// as any `one`, the other kinds' keys emptied, a required one never unset.
import type { FieldInfo } from './schema.ts'
import { resolveOneOf } from './nested-write.ts'
import type { OneOfInfo } from './one-of-schema.ts'
import type { Context } from './write-context.ts'
import { fail, resolving, trusted } from './write-context.ts'

type OneField = Extract<FieldInfo, { readonly kind: 'one' }>

/** A `one`'s write in the plan, as query-write.ts writes it. */
type WriteOne = (
	context: Context,
	field: OneField,
	value: unknown,
	creating: boolean,
) => Promise<void>

export async function oneOfField(
	context: Context,
	info: OneOfInfo,
	value: unknown,
	creating: boolean,
	one: WriteOne,
): Promise<void> {
	const skips = trusted(context, info, value)
	const r = resolving(context, skips, creating)
	const resolved = await resolveOneOf(r, info, value)
	for (const [kind, { field }] of info.kinds) {
		if (kind !== resolved?.kind) context.set[field] = null
	}
	if (resolved === undefined) return
	const field = context.model.fields.get(resolved.field)
	if (field?.kind !== 'one') return
	const written = { [resolved.operation]: resolved.operand }
	// The kind's `one` is the caller's when the `oneOf` is (D-67).
	const sent = skips ? context.sent : { ...context.sent, [field.name]: written }
	await one({ ...context, sent }, field, written, creating)
}

/** Fails on a required `oneOf` a create leaves without a kind. */
export function unsetOneOfs(context: Context): void {
	for (const info of context.model.oneOfs.values()) {
		const keys = [...info.kinds.values()].map(({ field }) => context.set[field])
		if (!info.optional && keys.every((key) => (key ?? null) === null)) {
			fail(context, [info.name], 'Required.')
		}
	}
}
