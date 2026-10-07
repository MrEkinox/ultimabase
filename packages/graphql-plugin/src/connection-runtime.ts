import { Buffer } from 'node:buffer'
import {
	createHash,
	createHmac,
	randomBytes,
	timingSafeEqual,
} from 'node:crypto'

import { normalizeReadOperation, type SchemaDefinition } from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { GraphqlInvalidCursorError } from './connection-errors.js'
import {
	defaultGraphqlExecutionLimits,
	maximumGraphqlInt,
	type NormalizedGraphqlExecutionLimits,
} from './connection-limits.js'
import { assertGraphqlKnownKeys } from './options.js'
import { effectiveGraphqlConnectionOrdering } from './read-normalization.js'
import { decodeGraphqlWhere } from './wire-values.js'

const connectionArgumentKeys = new Set(['after', 'first', 'orderBy', 'where'])
const maximumCursorLength = 4096
const base64urlPattern = /^[0-9A-Z_a-z-]+$/u
const fingerprintPattern = /^[0-9a-f]{64}$/u
const cursorPayloadKeys = ['fingerprint', 'offset', 'path', 'type', 'v']
const utf8 = new TextDecoder('utf-8', { fatal: true })

/** Identifies one root or nested relationship connection representation. */
interface CursorScope {
	readonly relationPath: readonly string[]
	readonly typeName: string
}

interface PagePlanState {
	readonly fingerprint: string
	readonly first: number
	readonly offset: number
	readonly owner: GraphqlConnectionRuntime
	readonly scope: CursorScope
}

/** Carries transport-owned page metadata separately from the Core operation. */
export interface GraphqlConnectionPagePlan {
	readonly [Symbol.toStringTag]: 'GraphqlConnectionPagePlan'
}

// Plans are opaque tokens: their state is reachable only through this module.
const pagePlanStates = new WeakMap<GraphqlConnectionPagePlan, PagePlanState>()

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

const canonicalValue = (value: unknown, ancestors: WeakSet<object>): string => {
	if (value === null) return 'null'
	if (typeof value === 'string') return `string:${JSON.stringify(value)}`
	if (typeof value === 'boolean') return value ? 'boolean:1' : 'boolean:0'
	if (typeof value === 'bigint') return `bigint:${value.toString()}`
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new TypeError('GraphQL cursor fingerprint requires finite numbers')
		}
		return `number:${Object.is(value, -0) ? '0' : String(value)}`
	}
	if (value instanceof Uint8Array) {
		return `bytes:${Buffer.from(value).toString('base64url')}`
	}
	if (typeof value !== 'object') {
		throw new TypeError('GraphQL cursor fingerprint value is unsupported')
	}
	if (ancestors.has(value)) {
		throw new TypeError('GraphQL cursor fingerprint value must not be cyclic')
	}
	ancestors.add(value)
	try {
		if (isUnknownArray(value)) {
			return `array:[${value
				.map((entry) => canonicalValue(entry, ancestors))
				.join(',')}]`
		}
		if (!isPlainRecord(value)) {
			throw new TypeError(
				'GraphQL cursor fingerprint objects must be plain records',
			)
		}
		if (Reflect.ownKeys(value).some((key) => typeof key !== 'string')) {
			throw new TypeError(
				'GraphQL cursor fingerprint objects must use string keys',
			)
		}
		return `object:{${Object.keys(value)
			.sort()
			.map(
				(key) =>
					`${JSON.stringify(key)}:${canonicalValue(value[key], ancestors)}`,
			)
			.join(',')}}`
	} finally {
		ancestors.delete(value)
	}
}

// Binds a cursor to the canonical wire filter and the ordered field priorities.
const fingerprintConnection = (
	where: unknown,
	order: Readonly<Record<string, 'asc' | 'desc'>>,
): string =>
	createHash('sha256')
		.update(
			canonicalValue(
				{ order: Object.entries(order), where: where ?? null },
				new WeakSet(),
			),
			'utf8',
		)
		.digest('hex')

const assertScope = (scope: CursorScope): void => {
	if (
		typeof scope.typeName !== 'string' ||
		scope.typeName === '' ||
		!isUnknownArray(scope.relationPath) ||
		!scope.relationPath.every(
			(segment) => typeof segment === 'string' && segment !== '',
		)
	) {
		throw new TypeError('GraphQL cursor scope is malformed')
	}
}

// Accepts only canonical base64url so one cursor has exactly one spelling.
const decodeSegment = (segment: string): Buffer => {
	if (!base64urlPattern.test(segment)) throw new GraphqlInvalidCursorError()
	const bytes = Buffer.from(segment, 'base64url')
	if (bytes.toString('base64url') !== segment) {
		throw new GraphqlInvalidCursorError()
	}
	return bytes
}

const readArguments = (value: unknown): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) {
		throw new TypeError('GraphQL connection arguments must be an object')
	}
	assertGraphqlKnownKeys(
		value,
		connectionArgumentKeys,
		'GraphQL connection',
		'an unknown argument',
	)
	return value
}

/** Owns cursor verification and page construction for one application. */
export class GraphqlConnectionRuntime {
	// One application-lifetime HMAC key protects cursor integrity.
	readonly #key: Buffer
	readonly #limits: NormalizedGraphqlExecutionLimits
	#disposed = false

	constructor(
		limits: NormalizedGraphqlExecutionLimits = defaultGraphqlExecutionLimits,
		key: Uint8Array = randomBytes(32),
	) {
		if (key.byteLength !== 32) {
			throw new RangeError('GraphQL cursor key must contain exactly 32 bytes')
		}
		this.#limits = limits
		this.#key = Buffer.from(key)
	}

	#assertActive(): void {
		if (this.#disposed) {
			throw new TypeError('GraphQL connection runtime has been disposed')
		}
	}

	#tag(payload: string): Buffer {
		return createHmac('sha256', this.#key).update(payload, 'ascii').digest()
	}

	#encode(scope: CursorScope, fingerprint: string, offset: number): string {
		assertScope(scope)
		if (!fingerprintPattern.test(fingerprint)) {
			throw new TypeError('GraphQL cursor fingerprint is malformed')
		}
		if (!Number.isSafeInteger(offset) || offset < 0) {
			throw new RangeError(
				'GraphQL cursor offset must be non-negative and safe',
			)
		}
		const payload = Buffer.from(
			JSON.stringify({
				v: 1,
				type: scope.typeName,
				path: scope.relationPath,
				fingerprint,
				offset,
			}),
			'utf8',
		).toString('base64url')
		return `${payload}.${this.#tag(payload).toString('base64url')}`
	}

	// Every failure is the same opaque error, so callers learn nothing about why.
	#decode(cursor: unknown, scope: CursorScope, fingerprint: string): number {
		assertScope(scope)
		if (
			typeof cursor !== 'string' ||
			cursor.length === 0 ||
			cursor.length > maximumCursorLength
		) {
			throw new GraphqlInvalidCursorError()
		}
		const [payloadSegment, tagSegment, ...rest] = cursor.split('.')
		if (
			payloadSegment === undefined ||
			tagSegment === undefined ||
			rest.length > 0
		) {
			throw new GraphqlInvalidCursorError()
		}
		const tag = decodeSegment(tagSegment)
		const expectedTag = this.#tag(payloadSegment)
		if (
			tag.byteLength !== expectedTag.byteLength ||
			!timingSafeEqual(tag, expectedTag)
		) {
			throw new GraphqlInvalidCursorError()
		}
		let payload: unknown
		try {
			payload = JSON.parse(utf8.decode(decodeSegment(payloadSegment)))
		} catch {
			throw new GraphqlInvalidCursorError()
		}
		if (
			!isPlainRecord(payload) ||
			Reflect.ownKeys(payload).length !== cursorPayloadKeys.length ||
			!cursorPayloadKeys.every((key) => Object.hasOwn(payload, key)) ||
			payload.v !== 1 ||
			payload.type !== scope.typeName ||
			payload.fingerprint !== fingerprint ||
			!isUnknownArray(payload.path) ||
			payload.path.length !== scope.relationPath.length ||
			!payload.path.every(
				(segment, index) => segment === scope.relationPath[index],
			) ||
			typeof payload.offset !== 'number' ||
			!Number.isSafeInteger(payload.offset) ||
			payload.offset < 0
		) {
			throw new GraphqlInvalidCursorError()
		}
		return payload.offset
	}

	prepare(options: GraphqlConnectionPreparation): GraphqlPreparedConnection {
		this.#assertActive()
		const args = readArguments(options.arguments)
		const first = args.first ?? this.#limits.defaultPageSize
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
		const fingerprint = fingerprintConnection(args.where, order)
		const scope: CursorScope = immutableRecord({
			relationPath: immutableArray(options.relationPath ?? []),
			typeName: options.typeName,
		})
		const offset =
			args.after === undefined || args.after === null
				? 0
				: this.#decode(args.after, scope, fingerprint)
		const clauses = immutableRecord({
			limit: first + 1,
			...(offset === 0 ? {} : { offset }),
			orderBy: order,
			...(hasWhere ? { where } : {}),
		})
		// Core remains the sole validator of every ordinary query clause.
		normalizeReadOperation(options.schema, 'find-many', clauses)
		const page: GraphqlConnectionPagePlan = Object.freeze({
			[Symbol.toStringTag]: 'GraphqlConnectionPagePlan' as const,
		})
		pagePlanStates.set(page, { fingerprint, first, offset, owner: this, scope })
		return immutableRecord({ clauses, page })
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
					cursor: this.#encode(
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
		this.#key.fill(0)
	}
}
