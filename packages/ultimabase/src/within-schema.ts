// A relation kept within the row's parent (D-220): the pair its options name,
// checked at start against both models; a many-to-many's, the field both
// models share (D-236).
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
	inverse: string,
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

/** The field a `many`'s `within` names, facing a `many` only (D-236). */
export function withinManyOf(
	where: string,
	options: FieldOptions,
	inverse: {
		readonly model: string
		readonly name: string
		readonly field: { readonly kind: string; readonly options: FieldOptions }
	},
): { readonly within?: string } {
	const within = options['within']
	if (within === undefined) return {}
	const theirs = `${inverse.model}.${inverse.name}`
	if (inverse.field.kind !== 'many') {
		throw new Refused(
			`${where}: within belongs on ${theirs}, which stores the key.`,
		)
	}
	if (inverse.field.options['within'] !== undefined) {
		throw new Refused(`${where} and ${theirs}: within goes on one side.`)
	}
	if (typeof within !== 'string') {
		const [field = 'project'] = isObject(within) ? Object.keys(within) : []
		throw new Refused(
			`${where}: within on a many names a field both models share, as within: '${field}'.`,
		)
	}
	return { within }
}

/**
 * Stops startup on a `within` whose row's side is no stored `one`, or whose
 * target's side is no required stored `one` to the same parent; or a
 * many-to-many's whose field is not one both models share.
 */
export function checkWithin(models: ReadonlyMap<string, ModelInfo>): void {
	for (const model of models.values()) {
		for (const field of model.fields.values()) {
			if (field.kind === 'many' && field.within !== undefined) {
				checkShared(
					models,
					model,
					field.within,
					`${model.name}.${field.name}`,
					field.target,
				)
			}
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
		}
	}
}

/** Both models' `field` is a required stored `one` to one model (D-236). */
function checkShared(
	models: ReadonlyMap<string, ModelInfo>,
	model: ModelInfo,
	field: string,
	where: string,
	target: string,
): void {
	const [own, theirs] = [model, models.get(target)].map((each) => {
		const found = each?.fields.get(field)
		return found?.kind === 'one' && found.stored && !found.optional
			? found.target
			: undefined
	})
	if (own === undefined || own !== theirs) {
		throw new Refused(
			`${where}: within names ${field}, a required one relation of ${model.name} and of ${target} to the same model.`,
		)
	}
}
