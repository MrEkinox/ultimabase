// A query's selection as one kernel read (D-107): the fields asked for, and
// each `many` relation's own page and count, read with its parent's rows.
import { badInput, readable } from '@ultimabase/http/internal'
import type {
	FieldNode,
	GraphQLObjectType,
	GraphQLResolveInfo,
	SelectionSetNode,
} from 'graphql'
import {
	getArgumentValues,
	getDirectiveValues,
	getNamedType,
	GraphQLIncludeDirective,
	GraphQLSkipDirective,
	isObjectType,
	Kind,
} from 'graphql'
import { objectType } from './outputs.ts'
import { listRead } from './pages.ts'
import type { Args, Registry } from './registry.ts'

export type Info = Pick<GraphQLResolveInfo, 'fragments' | 'variableValues'>
/** A field's name, or its alias: the key of its value in the response. */
export type Key = (node: FieldNode) => string
/** Fields under one key, the first of them included. */
export type Fields = readonly [FieldNode, ...FieldNode[]]
/** A field or an operation: what selects fields. */
export type Selecting = { readonly selectionSet?: SelectionSetNode | undefined }

function included(info: Info, node: Parameters<typeof getDirectiveValues>[1]) {
	const skip = getDirectiveValues(
		GraphQLSkipDirective,
		node,
		info.variableValues,
	)
	if (skip?.['if'] === true) return false
	const include = getDirectiveValues(
		GraphQLIncludeDirective,
		node,
		info.variableValues,
	)
	return include?.['if'] !== false
}

// A fragment spread again adds nothing the first spread did not, so each is
// collected once: spreading each fragment twice into the next would otherwise
// cost 2^n visits.
function collect(
	info: Info,
	set: SelectionSetNode | undefined,
	into: Map<string, [FieldNode, ...FieldNode[]]>,
	key: Key,
	spread: Set<string>,
): void {
	for (const selection of set?.selections ?? []) {
		if (!included(info, selection)) continue
		if (selection.kind === Kind.FIELD) {
			const found = into.get(key(selection))
			if (found === undefined) into.set(key(selection), [selection])
			else found.push(selection)
		} else if (selection.kind === Kind.INLINE_FRAGMENT) {
			collect(info, selection.selectionSet, into, key, spread)
		} else if (!spread.has(selection.name.value)) {
			spread.add(selection.name.value)
			const fragment = info.fragments[selection.name.value]
			collect(info, fragment?.selectionSet, into, key, spread)
		}
	}
}

const byName: Key = (node) => node.name.value

/** The fields under some nodes, by name, through fragments and directives. */
export function grouped(
	info: Info,
	nodes: readonly Selecting[],
	key: Key = byName,
): ReadonlyMap<string, Fields> {
	const into = new Map<string, [FieldNode, ...FieldNode[]]>()
	const spread = new Set<string>()
	for (const node of nodes) collect(info, node.selectionSet, into, key, spread)
	return into
}

/** One relation's arguments, the same under every alias. */
function argsOf(
	type: GraphQLObjectType,
	name: string,
	nodes: readonly FieldNode[],
	info: Info,
): Args {
	const field = type.getFields()[name]
	const [first, ...others] = nodes.map((node) =>
		field === undefined
			? {}
			: getArgumentValues(field, node, info.variableValues),
	)
	const key = JSON.stringify(first)
	if (others.some((args) => JSON.stringify(args) !== key)) {
		throw badInput(
			`${name} is selected twice with different arguments; read it once.`,
		)
	}
	return first ?? {}
}

/** Under a connection, the nodes its edges select. */
export function nodesOf(info: Info, nodes: readonly FieldNode[]): FieldNode[] {
	const edges = grouped(info, nodes).get('edges') ?? []
	return [...(grouped(info, edges).get('node') ?? [])]
}

const system = new Set(['id', 'createdAt', 'updatedAt'])

/** The kernel's `select` for what a query asks of a model's rows. */
export function selectOf(
	registry: Registry,
	info: Info,
	type: GraphQLObjectType,
	nodes: readonly FieldNode[],
	master: boolean,
): Args {
	const entry = registry.entry(type.name)
	const select: { [field: string]: unknown } = { id: true }
	// The connections' `totalCount`, each the count of its `where` (D-134).
	const counts: { [field: string]: unknown } = {}
	for (const [name, fieldNodes] of grouped(info, nodes)) {
		if (name === '__typename') continue
		if (system.has(name)) {
			select[name] = true
			continue
		}
		const field = entry.model.fields.find((f) => f.name === name)
		if (field === undefined) {
			// A field `extend` added: its resolver gets the row's scalars.
			for (const scalar of readable(entry)) {
				if (scalar.kind === 'scalar') select[scalar.name] = true
			}
			for (const key of system) select[key] = true
			continue
		}
		if (field.kind === 'scalar') {
			select[name] = true
			continue
		}
		const target = registry.entry(field.target)
		const targetObject = objectType(registry, field.target)
		if (field.kind === 'one') {
			select[name] = {
				select: selectOf(registry, info, targetObject, fieldNodes, master),
			}
			continue
		}
		const args = argsOf(type, name, fieldNodes, info)
		const { read } = listRead(registry, target, args, master)
		const list = registry.settings.pagination === 'list'
		const below = list ? fieldNodes : nodesOf(info, fieldNodes)
		select[name] = {
			...read,
			select: selectOf(registry, info, targetObject, below, master),
		}
		if (!list && grouped(info, fieldNodes).has('totalCount')) {
			counts[name] =
				read['where'] === undefined ? true : { where: read['where'] }
		}
	}
	if (Object.keys(counts).length > 0) select['_count'] = { select: counts }
	return select
}

/** `context.select(info)`, for a field that returns a model or a list of one. */
export function selectFor(
	registry: Registry,
	master: boolean,
): (info: GraphQLResolveInfo) => Args & { readonly id: true } {
	return (info) => {
		const type = getNamedType(info.returnType)
		if (!isObjectType(type) || !registry.entries.has(type.name)) {
			throw new Error(
				`context.select(info) reads a model's rows; ${info.parentType.name}.${info.fieldName} returns ${type.name}.`,
			)
		}
		return {
			...selectOf(registry, info, type, info.fieldNodes, master),
			id: true,
		}
	}
}
