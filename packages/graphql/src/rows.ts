// The row budget (D-107): a document that may return more than `maxRows`
// rows, or reads and writes more than `maxRoots` times at its root, is
// refused before it runs. Each list counts the rows it asks for, times the
// rows of the lists above it. Each relation a list's `orderBy` goes through
// counts one level of `maxDepth` under the list (D-134), whose level counts
// no connection or edge (D-185). Each field counts one value per row above
// it: past 50 values a row of `maxRows`, or a row a live list reads, the
// document is refused (D-349).
import type {
	FieldNode,
	GraphQLObjectType,
	ValidatedExecutionArgs,
} from 'graphql'
import {
	getArgumentValues,
	getNamedType,
	GraphQLError,
	isObjectType,
} from 'graphql'
import { oneOfsOf, sortDepth } from '@ultimabase/http/internal'
import type { Info, Selecting } from './select.ts'
import { grouped } from './select.ts'
import type { Entry, Registry } from './registry.ts'

/**
 * What a field reads: one row, a list of a model's rows, or a function's
 * list, which counts `take` rows (D-109).
 */
export type Read =
	| { readonly kind: 'one' }
	| { readonly kind: 'many'; readonly entry: Entry }
	| { readonly kind: 'list'; readonly size: number }

const one: Read = { kind: 'one' }
/** Each a query or a write of its own, a count one more. */
const maxRoots = 20
const responseKey = (node: FieldNode) => node.alias?.value ?? node.name.value

// `take` for none or a negative number; above `maxTake`, the list refuses.
const sizeOf = (entry: Entry, asked: unknown): number =>
	typeof asked === 'number' && asked >= 0
		? Math.min(asked, entry.maxTake)
		: entry.take

/** The reads of the root query, by field name. */
function rootReads(registry: Registry): ReadonlyMap<string, Read> {
	const reads = new Map<string, Read>()
	for (const entry of registry.entries.values()) {
		if (!entry.visible) continue
		reads.set(entry.single, one)
		reads.set(entry.list, { kind: 'many', entry })
	}
	return reads
}

/** What a document, or a live list in it, returns. */
type Tally = { rows: number; values: number }

export type Limits = { readonly maxRows: number; readonly maxDepth: number }

/** The refusal of a document that may return more than `maxRows` rows. */
export function rowBudget(
	registry: Registry,
	{ maxRows, maxDepth }: Limits,
	functions: ReadonlyMap<string, ReadonlyMap<string, Read>>,
): (args: ValidatedExecutionArgs) => GraphQLError | undefined {
	const roots = rootReads(registry)
	const list = registry.settings.pagination === 'list'
	const readOf = (
		type: GraphQLObjectType,
		root: string,
		name: string,
	): Read | undefined => {
		const called = functions.get(type.name)
		if (called?.has(name) === true) return called.get(name)
		if (root === 'mutation') return one
		if (root === 'query') return roots.get(name)
		const entry = registry.entries.get(type.name)
		if (entry === undefined) return undefined
		// A `oneOf` reads one row, of one of its kinds (D-247).
		if (oneOfsOf(entry.model).some((o) => o.name === name)) return one
		const field = entry.model.fields.find((f) => f.name === name)
		if (field === undefined || field.kind === 'scalar') return undefined
		if (field.kind === 'one' || (field.kind === 'many' && field.exists)) {
			return one
		}
		return { kind: 'many', entry: registry.entry(field.target) }
	}
	return (args) => {
		const info: Info = {
			fragments: args.fragmentDefinitions,
			variableValues: args.variableValues,
		}
		const total: Tally = { rows: 0, values: 0 }
		let wide = false
		const maxValues = maxRows * 50
		let rootFields = 0
		let deepest = 0
		const walk = (
			type: GraphQLObjectType,
			nodes: readonly Selecting[],
			times: number,
			root: string,
			level: number,
			tally: Tally = total,
			live = false,
		): void => {
			for (const fields of grouped(info, nodes, responseKey).values()) {
				if (total.rows > maxRows || tally.values > maxValues) return
				// One per row above it, `__typename` included.
				tally.values += times
				const [node] = fields
				const field = type.getFields()[node.name.value]
				if (field === undefined) continue
				const read = readOf(type, root, node.name.value)
				// A live row's and list's rows are bounded by `maxLive` instead
				// (D-154); a live row's values count, a live list returns at most 50
				// values a row it reads (D-349).
				const liveRow = root === 'subscription' && read === undefined
				const kept = liveRow ? roots.get(node.name.value) : undefined
				const named = getNamedType(field.type)
				if (kept?.kind === 'many' && isObjectType(named)) {
					// One row it follows and the rows it nests, whatever its window:
					// past `maxValues`, the count stops and the list is refused.
					const own = { rows: 1, values: 0 }
					walk(named, fields, 1, '', level + 1, own)
					wide = own.values > Math.min(own.rows * 50, maxValues)
					continue
				}
				let each = times
				if (read?.kind === 'many') {
					const asked = getArgumentValues(field, node, args.variableValues)
					const size = sizeOf(
						read.entry,
						list ? asked['take'] : (asked['last'] ?? asked['first']),
					)
					// A count reads the rows it counts, however few the page returns.
					deepest = Math.max(deepest, level + sortDepth(asked['orderBy']))
					const counted = grouped(info, fields).has('totalCount')
					each *= counted ? Math.max(size, read.entry.take) : size
					if (counted && root !== '') rootFields += 1
				} else if (read?.kind === 'list') each *= read.size
				if (read !== undefined && !live) tally.rows += each
				if (root !== '') rootFields += 1
				// A connection's and an edge's fields are no level (D-185).
				const below = registry.wrappers.has(type.name) ? level : level + 1
				if (isObjectType(named) && each > 0) {
					walk(named, fields, each, '', below, tally, live || liveRow)
				}
			}
		}
		const { operation } = args
		const type = args.schema.getRootType(operation.operation)
		// `validateExecutionArgs` refused an operation the schema has no root for.
		if (type) walk(type, [operation], 1, operation.operation, 1)
		if (deepest > maxDepth) {
			return new GraphQLError(
				`The document is nested ${deepest} levels deep, its orderBy included; the most is ${maxDepth}.`,
			)
		}
		if (rootFields > maxRoots) {
			return new GraphQLError(
				`The document asks for more than ${maxRoots} root fields, a totalCount counted as one more. Send several documents.`,
			)
		}
		if (total.rows > maxRows) {
			const fewer = list ? 'take' : 'first or last'
			return new GraphQLError(
				`The document asks for more than ${maxRows.toLocaleString('en-US')} rows. Ask for fewer with ${fewer}.`,
			)
		}
		if (total.values > maxValues) {
			return new GraphQLError(
				`The document returns more than ${maxValues.toLocaleString('en-US')} values. Select fewer fields, aliases or rows.`,
			)
		}
		if (!wide) return undefined
		return new GraphQLError(
			'The document returns more than 50 values a row. Select fewer fields or aliases.',
		)
	}
}
