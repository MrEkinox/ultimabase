import { normalizeReadOperation, type SchemaDefinition } from '@ultimabase/core'
import { decodeQueryCursor, encodeQueryCursor } from '@ultimabase/core/plugin'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	defaultGraphqlExecutionLimits,
	maximumGraphqlInt,
	type NormalizedGraphqlExecutionLimits,
} from './connection-limits.js'
import { assertGraphqlKnownKeys } from './known-keys.js'
import { effectiveGraphqlConnectionOrdering } from './read-normalization.js'
import { decodeGraphqlWhere } from './wire-values.js'

const argumentKeys = new Set(['after', 'first', 'orderBy', 'where'])

interface PagePlanState {
	readonly after: boolean
	readonly first: number
	readonly order: Readonly<Record<string, 'asc' | 'desc'>>
	readonly owner: GraphqlConnectionRuntime
	readonly schema: SchemaDefinition
}

/** Carries transport-owned page metadata separately from the Core operation. */
export interface GraphqlConnectionPagePlan {
	readonly [Symbol.toStringTag]: 'GraphqlConnectionPagePlan'
}

// Plans are opaque tokens: their state is reachable only through this module.
const pagePlanStates = new WeakMap<GraphqlConnectionPagePlan, PagePlanState>()

/** The filter a root connection's `totalCount` counts with (ADR-0325). */
export interface GraphqlConnectionCount {
	readonly schema: SchemaDefinition
	readonly where: unknown
}

// Only root connections carry a count; relation connections never do.
const connectionCounts = new WeakMap<object, GraphqlConnectionCount>()

/** Reads the count filter of a root connection, `undefined` for a relation one. */
export const readGraphqlConnectionCount = (
	connection: unknown,
): GraphqlConnectionCount | undefined =>
	typeof connection === 'object' && connection !== null
		? connectionCounts.get(connection)
		: undefined

export interface GraphqlPreparedConnection {
	readonly clauses: Readonly<Record<string, unknown>>
	/** Fields every node must carry so its edge cursor can be encoded. */
	readonly orderedFields: readonly string[]
	readonly page: GraphqlConnectionPagePlan
}

export interface GraphqlConnectionEdge<TNode> {
	readonly cursor: string
	readonly node: TNode
}

export interface GraphqlConnectionPageInfo {
	readonly endCursor: string | null
	readonly hasNextPage: boolean
	readonly hasPreviousPage: boolean
	readonly startCursor: string | null
}

export interface GraphqlConnection<TNode> {
	readonly edges: readonly GraphqlConnectionEdge<TNode>[]
	readonly nodes: readonly TNode[]
	readonly pageInfo: GraphqlConnectionPageInfo
}

export interface GraphqlConnectionPreparation {
	readonly arguments: unknown
	/** Names a nested relationship connection, paged per parent. */
	readonly relationPath?: readonly string[]
	readonly schema: SchemaDefinition
	readonly typeName: string
}

const readArguments = (
	value: unknown,
	keys: ReadonlySet<string>,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) {
		throw new TypeError('GraphQL connection arguments must be an object')
	}
	assertGraphqlKnownKeys(
		value,
		keys,
		'GraphQL connection',
		'an unknown argument',
	)
	return value
}

/**
 * Maps Relay `first` / `after` to Core `take` / `after` and encodes each edge
 * cursor with the shared unsigned cursor encoder (ADR-0309).
 */
export class GraphqlConnectionRuntime {
	readonly #limits: NormalizedGraphqlExecutionLimits
	#disposed = false

	constructor(
		limits: NormalizedGraphqlExecutionLimits = defaultGraphqlExecutionLimits,
	) {
		this.#limits = limits
	}

	#assertActive(): void {
		if (this.#disposed) {
			throw new TypeError('GraphQL connection runtime has been disposed')
		}
	}

	prepare(options: GraphqlConnectionPreparation): GraphqlPreparedConnection {
		this.#assertActive()
		const args = readArguments(options.arguments, argumentKeys)
		const first = args.first ?? this.#limits.defaultTake
		if (
			typeof first !== 'number' ||
			!Number.isSafeInteger(first) ||
			first < 0 ||
			first > maximumGraphqlInt ||
			first > this.#limits.maxTake
		) {
			throw new RangeError(
				`GraphQL first must be an integer from 0 to ${String(this.#limits.maxTake)}`,
			)
		}
		const order = effectiveGraphqlConnectionOrdering(args.orderBy)
		const hasWhere = args.where !== undefined && args.where !== null
		const hasAfter = args.after !== undefined && args.after !== null
		const clauses = immutableRecord({
			take: first + 1,
			orderBy: order,
			...(hasWhere
				? { where: decodeGraphqlWhere(options.schema, args.where) }
				: {}),
			...(hasAfter
				? { after: decodeQueryCursor(options.schema, order, args.after) }
				: {}),
		})
		// Core remains the sole validator of every ordinary query clause.
		normalizeReadOperation(options.schema, 'find-many', clauses)
		const page: GraphqlConnectionPagePlan = Object.freeze({
			[Symbol.toStringTag]: 'GraphqlConnectionPagePlan' as const,
		})
		pagePlanStates.set(page, {
			after: hasAfter,
			first,
			order,
			owner: this,
			schema: options.schema,
		})
		return immutableRecord({
			clauses,
			orderedFields: immutableArray(Object.keys(order)),
			page,
		})
	}

	page<TNode>(
		plan: GraphqlConnectionPagePlan,
		items: readonly TNode[],
		count?: GraphqlConnectionCount,
	): GraphqlConnection<TNode> {
		this.#assertActive()
		if (!isUnknownArray(items)) {
			throw new TypeError('GraphQL connection result must be an array')
		}
		const state = pagePlanStates.get(plan)
		if (state?.owner !== this) {
			throw new TypeError('GraphQL connection page plan is foreign')
		}
		if (items.length > state.first + 1) {
			throw new TypeError('GraphQL connection result exceeds its query take')
		}
		const nodes = immutableArray(items.slice(0, state.first))
		const edges = immutableArray(
			nodes.map((node) =>
				immutableRecord({
					cursor: encodeQueryCursor(state.schema, state.order, node),
					node,
				}),
			),
		)
		const connection = immutableRecord({
			edges,
			nodes,
			pageInfo: immutableRecord({
				endCursor: edges.at(-1)?.cursor ?? null,
				hasNextPage: items.length > state.first,
				hasPreviousPage: state.after,
				startCursor: edges[0]?.cursor ?? null,
			}),
		})
		if (count !== undefined) connectionCounts.set(connection, count)
		return connection
	}

	dispose(): void {
		this.#disposed = true
	}
}
