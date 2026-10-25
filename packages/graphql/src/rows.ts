// The row budget (D-107): a document that may return more than `maxRows`
// rows, or reads and writes more than `maxRoots` times at its root, is
// refused before it runs. Each list counts the rows it asks for, times the
// rows of the lists above it.
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

/** The refusal of a document that may return more than `maxRows` rows. */
export function rowBudget(
	registry: Registry,
	maxRows: number,
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
		const field = entry?.model.fields.find((f) => f.name === name)
		if (field === undefined || field.kind === 'scalar') return undefined
		if (field.kind === 'one') return one
		return { kind: 'many', entry: registry.entry(field.target) }
	}
	return (args) => {
		const info: Info = {
			fragments: args.fragmentDefinitions,
			variableValues: args.variableValues,
		}
		let rows = 0
		let rootFields = 0
		const walk = (
			type: GraphQLObjectType,
			nodes: readonly Selecting[],
			times: number,
			root: string,
		): void => {
			for (const fields of grouped(info, nodes, responseKey).values()) {
				if (rows > maxRows) return
				const [node] = fields
				const field = type.getFields()[node.name.value]
				if (field === undefined) continue
				const read = readOf(type, root, node.name.value)
				let each = times
				if (read?.kind === 'many') {
					const asked = getArgumentValues(field, node, args.variableValues)
					const size = sizeOf(
						read.entry,
						list ? asked['take'] : (asked['last'] ?? asked['first']),
					)
					// A count reads the rows it counts, however few the page returns.
					const counted = grouped(info, fields).has('totalCount')
					each *= counted ? Math.max(size, read.entry.take) : size
					if (counted && root !== '') rootFields += 1
				} else if (read?.kind === 'list') each *= read.size
				if (read !== undefined) rows += each
				if (root !== '') rootFields += 1
				const named = getNamedType(field.type)
				if (isObjectType(named) && each > 0) walk(named, fields, each, '')
			}
		}
		const { operation } = args
		const type = args.schema.getRootType(operation.operation)
		// `validateExecutionArgs` refused an operation the schema has no root for.
		if (type) walk(type, [operation], 1, operation.operation)
		if (rootFields > maxRoots) {
			return new GraphQLError(
				`The document asks for more than ${maxRoots} root fields, a totalCount counted as one more. Send several documents.`,
			)
		}
		if (rows <= maxRows) return undefined
		const fewer = list ? 'take' : 'first or last'
		return new GraphQLError(
			`The document asks for more than ${maxRows.toLocaleString('en-US')} rows. Ask for fewer with ${fewer}.`,
		)
	}
}
