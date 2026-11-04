// A relation's other side, which one of the two names with `inverse`:
// nothing pairs by itself (D-37, D-237).
import type { FieldDefinition } from './definition.ts'
import { Refused } from './errors.ts'

type Relation = Exclude<
	FieldDefinition,
	{ readonly kind: 'scalar' | 'virtual' | 'oneOf' }
>
export type Linked = {
	readonly model: string
	readonly name: string
	readonly field: Relation
	readonly target: string
}

function fail(message: string): never {
	throw new Refused(message)
}

const at = (link: Linked): string => `${link.model}.${link.name}`

/** The field a relation's `inverse` names, if it names one. */
export function namedOf(link: Linked): string | undefined {
	const named = link.field.options['inverse']
	return typeof named === 'string' ? named : undefined
}

/** The relation `link` names, checked against its target. */
function namesOf(link: Linked, links: readonly Linked[]): Linked | undefined {
	const named = namedOf(link)
	if (named === undefined) {
		if (link.field.kind === 'many') {
			fail(
				`${at(link)}: a many names its other side with inverse, or takes inverse: false for a many-to-many with no other side.`,
			)
		}
		return undefined
	}
	const found = links.find(
		(other) => other.model === link.target && other.name === named,
	)
	if (found === undefined || found.target !== link.model) {
		fail(
			`${at(link)}: inverse '${named}' is not a relation of ${link.target} to ${link.model}.`,
		)
	}
	if (found === link) fail(`${at(link)} cannot be its own inverse.`)
	if (link.field.kind === 'one' && found.field.kind === 'many') {
		fail(
			`${at(link)}: inverse names a many; drop it, ${at(found)} names this side.`,
		)
	}
	return found
}

/**
 * Each relation's other side: the one it names, or the one naming it; none
 * for a `one` that no relation names, which stores its key alone.
 */
export function pairsOf(
	links: readonly Linked[],
): ReadonlyMap<Linked, Linked | undefined> {
	const names = new Map<Linked, Linked>()
	const namedBy = new Map<Linked, Linked>()
	for (const link of links) {
		const other = namesOf(link, links)
		if (other === undefined) continue
		const first = namedBy.get(other)
		if (first !== undefined) {
			fail(`${at(first)} and ${at(link)} both name ${at(other)}.`)
		}
		names.set(link, other)
		namedBy.set(other, link)
	}
	const pairs = new Map<Linked, Linked | undefined>()
	for (const link of links) {
		const mine = names.get(link)
		const theirs = namedBy.get(link)
		if (mine === undefined) {
			pairs.set(link, theirs)
			continue
		}
		if (theirs !== undefined && theirs !== mine) {
			fail(`${at(link)} and ${at(mine)} do not name each other.`)
		}
		if (link.field.kind === 'one') {
			if (theirs !== undefined) {
				fail(
					`${at(link)} and ${at(mine)} name each other; only the side that stores no key names the other.`,
				)
			}
			if (link.field.options['optional'] !== true) {
				fail(
					`${at(link)}: the side of a one-to-one that names the other stores no key, and is optional.`,
				)
			}
		} else if (mine.field.kind === 'many' && theirs === undefined) {
			fail(`${at(link)} and ${at(mine)} do not name each other.`)
		}
		pairs.set(link, mine)
	}
	return pairs
}
