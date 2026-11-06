// The rows of a live read its hook keeps in the cache (D-252). The hook reads
// with `no-cache`, so a message costs the rows it changed: each is written
// alone, through a fragment derived from the selection. The cache holds a row
// against its collections for each write: one hold is kept for as long as the
// read shows the row.
import type { ApolloCache, ApolloLink } from '@apollo/client'
import type {
	DocumentNode,
	FieldNode,
	FragmentDefinitionNode,
	SelectionSetNode,
} from 'graphql'
import { Kind } from 'graphql'
import type { LiveChange, LiveList } from './apply.ts'
import { isRecord } from './guards.ts'

/** The rows of `list`, the nodes under a connection. */
export function rowsOf(list: LiveList): readonly unknown[] {
	if (Array.isArray(list)) return list
	const edges: unknown = Reflect.get(list, 'edges')
	if (!Array.isArray(edges)) return []
	return edges.map(nodeOf)
}

const nodeOf = (edge: unknown): unknown =>
	isRecord(edge) ? edge['node'] : undefined

const isConnection = (value: unknown): value is LiveList =>
	isRecord(value) && Array.isArray(value['edges'])

/** What lets a collection take a written row: `InMemoryCache` has it. */
type Releasing = { readonly release: (id: string) => unknown }

const releases = (cache: object): cache is Releasing => 'release' in cache

/** Every field `name` holds of `parents`, through their fragments. */
function fieldsIn(
	parents: readonly FieldNode[],
	name: string,
	fragments: readonly FragmentDefinitionNode[],
): readonly FieldNode[] {
	const within = (set: SelectionSetNode | undefined): readonly FieldNode[] =>
		(set?.selections ?? []).flatMap((selection) => {
			if (selection.kind === Kind.FIELD) {
				return (selection.alias ?? selection.name).value === name
					? [selection]
					: []
			}
			if (selection.kind === Kind.INLINE_FRAGMENT) {
				return within(selection.selectionSet)
			}
			return within(
				fragments.find((each) => each.name.value === selection.name.value)
					?.selectionSet,
			)
		})
	return parents.flatMap(({ selectionSet }) => within(selectionSet))
}

/** Writes a live read's rows to the cache and holds them there. */
export class CachedRows {
	readonly #cache: ApolloCache
	readonly #operation: ApolloLink.Operation
	readonly #field: FieldNode
	/** The cache's id of each row held, by the row's id. */
	readonly #held = new Map<string, string>()
	/** Each row type's fragment, the same document for the cache to remember. */
	readonly #documents = new Map<string, DocumentNode>()
	readonly #fragments: readonly FragmentDefinitionNode[]

	constructor(operation: ApolloLink.Operation, field: FieldNode) {
		this.#cache = operation.client.cache
		this.#operation = operation
		this.#field = field
		this.#fragments = operation.query.definitions.filter(
			(definition): definition is FragmentDefinitionNode =>
				definition.kind === Kind.FRAGMENT_DEFINITION,
		)
	}

	/** The fragment of a row of `typename`, under a connection or not. */
	#documentOf(typename: string, connected: boolean): DocumentNode {
		const known = this.#documents.get(typename)
		if (known !== undefined) return known
		const parents = connected
			? fieldsIn(
					fieldsIn([this.#field], 'edges', this.#fragments),
					'node',
					this.#fragments,
				)
			: [this.#field]
		const definition: FragmentDefinitionNode = {
			kind: Kind.FRAGMENT_DEFINITION,
			name: { kind: Kind.NAME, value: 'LiveRow' },
			typeCondition: {
				kind: Kind.NAMED_TYPE,
				name: { kind: Kind.NAME, value: typename },
			},
			selectionSet: {
				kind: Kind.SELECTION_SET,
				selections: parents.flatMap(
					({ selectionSet }) => selectionSet?.selections ?? [],
				),
			},
		}
		const document: DocumentNode = {
			kind: Kind.DOCUMENT,
			definitions: [definition, ...this.#fragments],
		}
		this.#documents.set(typename, document)
		return document
	}

	/** Writes `row` and holds it; one the cache cannot name stays out. */
	#write(cache: ApolloCache, row: unknown, connected: boolean): void {
		if (!isRecord(row)) return
		const { id, __typename: typename } = row
		if (typeof id !== 'string' || typeof typename !== 'string') return
		const named = cache.identify({ ...row, __typename: typename })
		if (named === undefined) return
		cache.writeFragment({
			id: named,
			fragment: this.#documentOf(typename, connected),
			fragmentName: 'LiveRow',
			data: row,
			variables: this.#operation.variables,
		})
		if (!this.#held.has(id)) this.#held.set(id, named)
		else if (releases(this.#cache)) this.#cache.release(named)
	}

	#release(id: string): void {
		const named = this.#held.get(id)
		if (named === undefined) return
		this.#held.delete(id)
		if (releases(this.#cache)) this.#cache.release(named)
	}

	/**
	 * In the cache's own data: an optimistic layer's writes go when it is
	 * rolled back.
	 */
	#batched(update: (cache: ApolloCache) => void): void {
		this.#cache.batch({ optimistic: false, update })
	}

	/** Writes all a read shows now, a list or a row: the others are held no more. */
	shown(value: unknown): void {
		const connected = isConnection(value)
		const rows = connected || Array.isArray(value) ? rowsOf(value) : [value]
		this.#batched((cache) => {
			for (const row of rows) this.#write(cache, row, connected)
		})
		const kept = new Set(
			rows.map((row) => (isRecord(row) ? row['id'] : undefined)),
		)
		for (const id of this.#held.keys()) {
			if (!kept.has(id)) this.#release(id)
		}
	}

	/** Writes the rows `changes` placed, and no longer holds those removed. */
	changed(changes: readonly LiveChange[], connected: boolean): void {
		this.#batched((cache) => {
			for (const change of changes) {
				if ('remove' in change) this.#release(change.remove)
				else {
					const row = connected ? nodeOf(change.upsert) : change.upsert
					this.#write(cache, row, connected)
				}
			}
		})
	}

	/** Holds no row: the read closed. */
	close(): void {
		for (const id of this.#held.keys()) this.#release(id)
	}
}
