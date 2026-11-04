// A read's `_count`: the `many` relations it counts, each with its filter
// (D-134).
import type { Filter } from './adapter.ts'
import { and } from './access.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import type { Models, Scope } from './query-where.ts'
import { entries, modelOf, normalizeWhere, unknownKey } from './query-where.ts'

type Many = Extract<FieldInfo, { readonly kind: 'many' }>

/** `_count`: the `many` relations it names, each with its filter (D-134). */
export function counted(
	models: Models,
	model: ModelInfo,
	value: unknown,
	path: string,
	scope: Scope | undefined,
): Map<string, Filter> {
	const filter = (field: Many, where?: Filter): Filter =>
		and(where, scope?.related(model, field)) ?? {}
	const counts = new Map<string, Filter>()
	if (value === true) {
		for (const field of model.fields.values()) {
			// A one-sided many-to-many's hidden side is no field (D-248).
			if (field.kind === 'many' && !field.exists && !field.hidden) {
				counts.set(field.name, filter(field))
			}
		}
		return counts
	}
	const given = new Map(entries(value, path))
	for (const key of given.keys()) {
		if (key !== 'select') throw unknownKey(`${path}.${key}`, model.name)
	}
	const select = `${path}.select`
	for (const [name, chosen] of entries(given.get('select'), select)) {
		const at = `${select}.${name}`
		const field = model.fields.get(name)
		if (field?.kind !== 'many' || field.exists || field.hidden) {
			throw unknownKey(at, model.name)
		}
		if (chosen === false) continue
		if (chosen === true) {
			counts.set(name, filter(field))
			continue
		}
		const args = new Map(entries(chosen, at))
		for (const key of args.keys()) {
			if (key !== 'where') throw unknownKey(`${at}.${key}`, model.name)
		}
		const counting = modelOf(models, field.target)
		const where = args.has('where')
			? normalizeWhere(
					models,
					counting,
					args.get('where'),
					`${at}.where`,
					scope,
				)
			: undefined
		counts.set(name, filter(field, where))
	}
	return counts
}
