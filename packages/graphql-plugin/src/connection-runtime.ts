import { normalizeReadOperation, type SchemaDefinition } from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { GraphqlCursorCodec, type GraphqlCursorScope } from './cursor-codec.js'
import { fingerprintGraphqlConnection } from './connection-fingerprint.js'
import {
	defaultGraphqlExecutionLimits,
	type NormalizedGraphqlExecutionLimits,
} from './connection-limits.js'
import { decodeGraphqlWhere } from './read-values.js'
import { effectiveGraphqlConnectionOrdering } from './read-ordering.js'

const connectionArgumentKeys = new Set(['after', 'first', 'orderBy', 'where'])
const maximumGraphqlInt = 2_147_483_647

interface GraphqlConnectionPagePlanState {
	readonly fingerprint: string
	readonly first: number
	readonly offset: number
	readonly owner: GraphqlConnectionRuntime
	readonly scope: GraphqlCursorScope
}

const pagePlanStates = new WeakMap<
	GraphqlConnectionPagePlan,
	GraphqlConnectionPagePlanState
>()

/** Carries transport-owned page metadata separately from the Core operation. */
export class GraphqlConnectionPagePlan {
	readonly [Symbol.toStringTag] = 'GraphqlConnectionPagePlan'

	constructor(state: GraphqlConnectionPagePlanState) {
		pagePlanStates.set(this, state)
		Object.freeze(this)
	}
}

export interface GraphqlPreparedConnection {
	readonly clauses: Readonly<Record<string, unknown>>
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
	readonly relationPath?: readonly string[]
	readonly schema: SchemaDefinition
	readonly typeName: string
}

const readArguments = (value: unknown): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) {
		throw new TypeError('GraphQL connection arguments must be an object')
	}
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !connectionArgumentKeys.has(key)) {
			throw new TypeError(
				`GraphQL connection contains an unknown argument: ${String(key)}`,
			)
		}
	}
	return value
}

/** Owns cursor verification and page construction for one application. */
export class GraphqlConnectionRuntime {
	readonly #codec: GraphqlCursorCodec
	readonly #limits: NormalizedGraphqlExecutionLimits
	#disposed = false

	constructor(
		limits: NormalizedGraphqlExecutionLimits = defaultGraphqlExecutionLimits,
		key?: Uint8Array,
	) {
		this.#limits = limits
		this.#codec = new GraphqlCursorCodec(key)
	}

	get defaultPageSize(): number {
		return this.#limits.defaultPageSize
	}

	get maxPageSize(): number {
		return this.#limits.maxPageSize
	}

	#assertActive(): void {
		if (this.#disposed) {
			throw new TypeError('GraphQL connection runtime has been disposed')
		}
	}

	prepare(options: GraphqlConnectionPreparation): GraphqlPreparedConnection {
		this.#assertActive()
		const args = readArguments(options.arguments)
		const untrustedFirst = args.first
		const first = untrustedFirst ?? this.#limits.defaultPageSize
		if (
			typeof first !== 'number' ||
			!Number.isSafeInteger(first) ||
			first < 0 ||
			first > maximumGraphqlInt ||
			first > this.#limits.maxPageSize
		) {
			throw new RangeError(
				`GraphQL first must be an integer from 0 to ${String(this.#limits.maxPageSize)}`,
			)
		}
		const order = effectiveGraphqlConnectionOrdering(args.orderBy)
		const hasWhere = args.where !== undefined && args.where !== null
		const where = hasWhere
			? decodeGraphqlWhere(options.schema, args.where)
			: undefined
		// Bind the canonical GraphQL wire value so plugin logical values never need
		// a second, transport-invented serialization contract.
		const fingerprint = fingerprintGraphqlConnection(args.where, order)
		const scope: GraphqlCursorScope = immutableRecord({
			relationPath: immutableArray(options.relationPath ?? []),
			typeName: options.typeName,
		})
		const hasAfter = args.after !== undefined && args.after !== null
		const offset = hasAfter
			? this.#codec.decode(args.after, scope, fingerprint)
			: 0
		const clauses = immutableRecord({
			limit: first + 1,
			...(offset === 0 ? {} : { offset }),
			orderBy: order,
			...(hasWhere ? { where } : {}),
		})
		// Core remains the sole validator of every ordinary query clause.
		normalizeReadOperation(options.schema, 'find-many', clauses)
		return immutableRecord({
			clauses,
			page: new GraphqlConnectionPagePlan({
				fingerprint,
				first,
				offset,
				owner: this,
				scope,
			}),
		})
	}

	page<TNode>(
		plan: GraphqlConnectionPagePlan,
		items: readonly TNode[],
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
			throw new TypeError('GraphQL connection result exceeds its query limit')
		}
		const nodes = immutableArray(items.slice(0, state.first))
		const edges = immutableArray(
			nodes.map((node, index) =>
				immutableRecord({
					cursor: this.#codec.encode(
						state.scope,
						state.fingerprint,
						state.offset + index + 1,
					),
					node,
				}),
			),
		)
		return immutableRecord({
			edges,
			nodes,
			pageInfo: immutableRecord({
				endCursor: edges.at(-1)?.cursor ?? null,
				hasNextPage: items.length > state.first,
				hasPreviousPage: state.offset > 0,
				startCursor: edges[0]?.cursor ?? null,
			}),
		})
	}

	dispose(): void {
		if (this.#disposed) return
		this.#disposed = true
		this.#codec.dispose()
	}
}
