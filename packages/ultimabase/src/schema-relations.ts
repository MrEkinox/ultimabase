// Each relation's inverse, and the side that stores its key (D-37, D-54,
// D-233).
import type { FieldDefinition } from './definition.ts'
import { Refused } from './errors.ts'
import type { FieldInfo } from './schema.ts'
import { withinOf } from './within-schema.ts'

type Relation = Extract<FieldDefinition, { readonly kind: 'one' | 'many' }>
export type Linked = {
	readonly model: string
	readonly name: string
	readonly field: Relation
	readonly target: string
}

function fail(message: string): never {
	throw new Refused(message)
}

export function inverseOf(link: Linked, links: readonly Linked[]): Linked {
	const { model, name, target } = link
	const where = `${model}.${name}`
	const named = link.field.options['inverse']
	const back = links.filter(
		(other) =>
			other.model === target &&
			other.target === model &&
			!(other.model === model && other.name === name),
	)
	if (typeof named === 'string') {
		const found = links.find(
			(other) => other.model === target && other.name === named,
		)
		if (found === undefined || found.target !== model) {
			fail(
				`${where}: inverse '${named}' is not a relation of ${target} to ${model}.`,
			)
		}
		if (found.model === model && found.name === name) {
			fail(`${where} cannot be its own inverse.`)
		}
		return found
	}
	const candidates = back.filter((other) => {
		const theirs = other.field.options['inverse']
		return typeof theirs !== 'string' || theirs === name
	})
	const [only, ...others] = candidates
	if (only === undefined) {
		fail(`${where}: ${target} has no relation to ${model}; add its side.`)
	}
	if (others.length > 0) {
		fail(
			`${where}: ${target} has several relations to ${model}; name one with \`inverse\`.`,
		)
	}
	return only
}

export function relationField(link: Linked, inverse: Linked): FieldInfo {
	const { field } = link
	const optional = field.options['optional'] === true
	const where = `${link.model}.${link.name}`
	if (field.kind === 'many') {
		return {
			kind: 'many',
			name: link.name,
			target: link.target,
			inverse: inverse.name,
			join: inverse.field.kind === 'many',
			options: field.options,
		}
	}
	const asked = field.options['onDelete']
	let stored = inverse.field.kind === 'many'
	if (inverse.field.kind === 'one') {
		const both = `${where} and ${inverse.model}.${inverse.name}`
		const theirs = inverse.field.options['optional'] === true
		if (!optional && !theirs) {
			fail(`${both}: make one side of a one-to-one relation optional.`)
		}
		stored = !optional
		// Both optional: the side naming onDelete stores the key (D-233).
		if (optional && theirs) {
			stored = asked !== undefined
			if (stored === (inverse.field.options['onDelete'] !== undefined)) {
				fail(
					stored
						? `${both}: only one side of a one-to-one stores the key; keep onDelete on that one.`
						: `${both}: make one side of the one-to-one required, or give the side that stores the key onDelete.`,
				)
			}
		}
	}
	if (!stored && asked !== undefined) {
		fail(
			`${where}: onDelete belongs on ${inverse.model}.${inverse.name}, which stores the key.`,
		)
	}
	if (asked === 'setNull' && !optional) {
		throw new Refused(`${where}: setNull needs an optional relation.`)
	}
	const onDelete =
		asked === 'cascade' || asked === 'restrict' || asked === 'setNull'
			? asked
			: optional
				? 'setNull'
				: 'restrict'
	const dbName = field.options['dbName']
	return {
		kind: 'one',
		name: link.name,
		target: link.target,
		inverse: inverse.name,
		stored,
		unique: stored && inverse.field.kind === 'one',
		optional,
		onDelete,
		...(typeof dbName === 'string' ? { dbName } : {}),
		...withinOf(
			where,
			field.options,
			stored,
			`${inverse.model}.${inverse.name}`,
		),
		options: field.options,
	}
}
