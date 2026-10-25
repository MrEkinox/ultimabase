// The bound on graphql-js's overlapping-fields rule (D-107): the rule
// compares every two fields that merge under one response key, so a
// document whose merged fields make more than `maxPairs` such pairs is
// refused before it is validated.
import type {
	DocumentNode,
	FieldNode,
	FragmentDefinitionNode,
	SelectionSetNode,
} from 'graphql'
import { GraphQLError, Kind } from 'graphql'

/** At about 28 µs a pair, the rule's slowest, about 30 ms of validation. */
const maxPairs = 1000

/** Fields of one key, and how many came from each place (see `merged`). */
interface Merged {
	readonly fields: FieldNode[]
	readonly from: Map<string, number>
}

const pairsOf = (fields: number) => (fields * (fields - 1)) / 2

/** The refusal of a document whose fields of one key make too many pairs. */
export function overlapRefusal(
	document: DocumentNode,
): GraphQLError | undefined {
	const fragments = new Map<string, FragmentDefinitionNode>()
	for (const definition of document.definitions) {
		if (definition.kind === Kind.FRAGMENT_DEFINITION) {
			fragments.set(definition.name.value, definition)
		}
	}
	// A selection set merged with no other is counted once, wherever it is
	// reached, as the rule compares its fields once.
	const counted = new Set<SelectionSetNode>()
	let pairs = 0
	/**
	 * The fields of `sets` by response key, fragments spread once, each with
	 * how many came from each fragment spread in `sets`, or from `sets`.
	 */
	const merged = (sets: readonly SelectionSetNode[]) => {
		const byKey = new Map<string, Merged>()
		const spread = new Set<string>()
		const collect = (set: SelectionSetNode, from: string): void => {
			for (const selection of set.selections) {
				if (selection.kind === Kind.FIELD) {
					const key = selection.alias?.value ?? selection.name.value
					const same: Merged = byKey.get(key) ?? { fields: [], from: new Map() }
					byKey.set(key, same)
					same.fields.push(selection)
					same.from.set(from, (same.from.get(from) ?? 0) + 1)
				} else if (selection.kind === Kind.INLINE_FRAGMENT) {
					collect(selection.selectionSet, from)
				} else {
					const name = selection.name.value
					const fragment = fragments.get(name)
					if (fragment === undefined || spread.has(name)) continue
					spread.add(name)
					collect(fragment.selectionSet, from === '' ? name : from)
				}
			}
		}
		for (const set of sets) collect(set, '')
		return byKey.values()
	}
	const walk = (sets: readonly SelectionSetNode[]): void => {
		const [only] = sets
		if (sets.length === 1 && only !== undefined) {
			if (counted.has(only)) return
			counted.add(only)
		}
		for (const { fields, from } of merged(sets)) {
			if (pairs > maxPairs) return
			pairs += pairsOf(fields.length)
			// The pairs within a fragment are counted where it is defined.
			for (const [fragment, count] of from) {
				if (fragment !== '') pairs -= pairsOf(count)
			}
			if (from.size === 1 && !from.has('')) continue
			const below = fields.flatMap((field) => field.selectionSet ?? [])
			if (below.length > 0) walk(below)
		}
	}
	for (const definition of document.definitions) {
		if (
			definition.kind === Kind.OPERATION_DEFINITION ||
			definition.kind === Kind.FRAGMENT_DEFINITION
		) {
			walk([definition.selectionSet])
		}
	}
	if (pairs <= maxPairs) return undefined
	return new GraphQLError(
		'The document repeats fields under one name too often. Ask for each field once.',
	)
}
