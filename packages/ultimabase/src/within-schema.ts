// A relation kept within the row's parent (D-220): the pair its options name,
// checked at start against both models.
import type { FieldOptions } from './definition.ts'
import { Refused } from './errors.ts'
import { isObject } from './query-values.ts'
import type { ModelInfo } from './schema.ts'

/** The target's `target` field equals the row's `source`, a field or `id`. */
export type Within = { readonly target: string; readonly source: string }

/** The pair of a relation's `within`, which only the side storing the key takes. */
export function withinOf(
	where: string,
	options: FieldOptions,
	stored: boolean,
	inverse: string | undefined,
): { readonly within?: Within } {
	const within = options['within']
	if (within === undefined) return {}
	if (!stored) {
		throw new Refused(
			`${where}: within belongs on ${inverse}, which stores the key.`,
		)
	}
	if (typeof within === 'string') {
		return { within: { target: within, source: within } }
	}
	const pairs = isObject(within) ? Object.entries(within) : []
	const [pair] = pairs
	if (pair === undefined || pairs.length > 1 || typeof pair[1] !== 'string') {
		throw new Refused(
			`${where}: within names one pair, a field of the target and id or a field of the row.`,
		)
	}
	return { within: { target: pair[0], source: pair[1] } }
}

/**
 * Stops startup on a `within` whose row's side is no stored `one`, or whose
 * target's side is no required stored `one` to the same parent.
 */
export function checkWithin(models: ReadonlyMap<string, ModelInfo>): void {
	for (const model of models.values()) {
		for (const field of model.fields.values()) {
			if (field.kind !== 'one' || field.within === undefined) continue
			const { target, source } = field.within
			const where = `${model.name}.${field.name}`
			let parent = model.name
			if (source !== 'id') {
				const own = model.fields.get(source)
				if (own?.kind !== 'one' || !own.stored) {
					throw new Refused(
						`${where}: within names ${source}, a one relation of ${model.name}.`,
					)
				}
				parent = own.target
			}
			const theirs = models.get(field.target)?.fields.get(target)
			if (
				theirs?.kind !== 'one' ||
				!theirs.stored ||
				theirs.optional ||
				theirs.target !== parent
			) {
				throw new Refused(
					`${where}: within names ${target}, a required one relation of ${field.target} to ${parent}.`,
				)
			}
			// Its other side tells which targets a parent holds (D-237).
			if (theirs.inverse === undefined) {
				throw new Refused(
					`${where}: within names ${field.target}.${target}, which needs its other side.`,
				)
			}
		}
	}
}
