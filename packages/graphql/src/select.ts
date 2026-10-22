// A query's selection as one kernel read (D-107): the fields asked for, and
// each `many` relation's own page, read with its parent's rows.
import type {
	FieldNode,
	GraphQLObjectType,
	GraphQLResolveInfo,
	SelectionSetNode,
} from 'graphql'
import {
	getArgumentValues,
	getDirectiveValues,
	GraphQLIncludeDirective,
	GraphQLSkipDirective,
	Kind,
} from 'graphql'
import { badInput } from './errors.ts'
import { objectType } from './outputs.ts'
import { listRead } from './pages.ts'
import type { Args, Registry } from './registry.ts'

type Info = Pick<GraphQLResolveInfo, 'fragments' | 'variableValues'>

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

function collect(
	info: Info,
	set: SelectionSetNode | undefined,
	into: Map<string, FieldNode[]>,
): void {
	for (const selection of set?.selections ?? []) {
		if (!included(info, selection)) continue
		if (selection.kind === Kind.FIELD) {
			const name = selection.name.value
			into.set(name, [...(into.get(name) ?? []), selection])
		} else if (selection.kind === Kind.INLINE_FRAGMENT) {
			collect(info, selection.selectionSet, into)
		} else {
			collect(info, info.fragments[selection.name.value]?.selectionSet, into)
		}
	}
}

/** The fields under some nodes, by name, through fragments and directives. */
export function grouped(
	info: Info,
	nodes: readonly FieldNode[],
): ReadonlyMap<string, readonly FieldNode[]> {
	const into = new Map<string, FieldNode[]>()
	for (const node of nodes) collect(info, node.selectionSet, into)
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
function nodesOf(info: Info, nodes: readonly FieldNode[]): FieldNode[] {
	const edges = grouped(info, nodes).get('edges') ?? []
	return [...(grouped(info, edges).get('node') ?? [])]
}

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
	for (const [name, fieldNodes] of grouped(info, nodes)) {
		const field = entry.model.fields.find((f) => f.name === name)
		if (field === undefined || field.kind === 'scalar') {
			if (name !== '__typename') select[name] = true
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
		const { read } = listRead(
			registry.settings.pagination,
			target,
			args,
			master,
		)
		const below =
			registry.settings.pagination === 'list'
				? fieldNodes
				: nodesOf(info, fieldNodes)
		select[name] = {
			...read,
			select: selectOf(registry, info, targetObject, below, master),
		}
	}
	return select
}
