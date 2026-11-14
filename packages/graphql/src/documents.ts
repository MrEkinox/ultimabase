// The documents a server has read (D-268): an application sends the same few
// again and again, over HTTP and for each subscription of each user. Read once,
// they are one tree in memory rather than one per subscriber.
import type {
	DocumentNode,
	GraphQLError,
	Source,
	ValidationRule,
} from 'graphql'

/**
 * Bounds what unknown documents can hold: a tree holds up to 210 bytes a
 * character, so 256 KB of text holds 55 MB at most.
 */
const documents = 500
const text = 256 * 1024
const longest = 4096

/** `parse`, which answers a document it has read with the same tree. */
export function parsedOnce(
	parse: (source: string | Source) => DocumentNode,
): (source: string | Source) => DocumentNode {
	const parsed = new Map<string, DocumentNode>()
	let size = 0
	return (source) => {
		if (typeof source !== 'string' || source.length > longest) {
			return parse(source)
		}
		const known = parsed.get(source)
		if (known !== undefined) {
			// The least recently asked goes first.
			parsed.delete(source)
			parsed.set(source, known)
			return known
		}
		const document = parse(source)
		parsed.set(source, document)
		size += source.length
		for (const oldest of parsed.keys()) {
			if (parsed.size <= documents && size <= text) break
			parsed.delete(oldest)
			size -= oldest.length
		}
		return document
	}
}

type Validate = (
	document: DocumentNode,
	rules?: readonly ValidationRule[],
) => readonly GraphQLError[]

/**
 * `validate`, which remembers what passed, by the rules it passed: a document
 * Master may send is not one a user may.
 */
export function validatedOnce(validate: Validate): Validate {
	const passed = new WeakMap<DocumentNode, Set<readonly ValidationRule[]>>()
	return (document, rules) => {
		if (rules === undefined) return validate(document)
		if (passed.get(document)?.has(rules) === true) return []
		const errors = validate(document, rules)
		if (errors.length > 0) return errors
		const those = passed.get(document) ?? new Set()
		those.add(rules)
		passed.set(document, those)
		return errors
	}
}
