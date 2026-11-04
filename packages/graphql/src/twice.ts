// A relation or a virtual selected twice with different arguments is refused
// as the document is validated, before anything runs (D-107, D-185). The
// kernel reads one `select` per row, so a model's fields merge by name,
// through aliases, fragments and connections, as `selectOf` merges them;
// only a root field and a field `extend` added resolve once per alias.
import type {
	FieldNode,
	GraphQLNamedType,
	SelectionSetNode,
	ValidationContext,
	ValidationRule,
	ValueNode,
} from 'graphql'
import { getNamedType, GraphQLError, isObjectType, Kind, print } from 'graphql'
import { oneOfsOf } from '@ultimabase/http/internal'
import type { Registry } from './registry.ts'
import type { Key } from './select.ts'

/** A selection set, and the response path of the field that selects it. */
type At = { readonly set: SelectionSetNode; readonly path: string }
/** A field, and the response path of the set it is in. */
type Found = { readonly node: FieldNode; readonly path: string }
/** Fields under one key, the first of them included. */
type Same = readonly [Found, ...Found[]]

const responseKey: Key = (node) => node.alias?.value ?? node.name.value
const byName: Key = (node) => node.name.value
const pathOf = ({ node, path }: Found) =>
	path === '' ? responseKey(node) : `${path}.${responseKey(node)}`

/** A value as text, an object's fields in any order the same. */
function canonical(value: ValueNode): string {
	if (value.kind === Kind.OBJECT) {
		const fields = value.fields.map(
			(field) => `${field.name.value}:${canonical(field.value)}`,
		)
		return `{${fields.toSorted().join(',')}}`
	}
	if (value.kind === Kind.LIST) {
		return `[${value.values.map(canonical).join(',')}]`
	}
	return print(value)
}

/** A field's arguments as text, in any order the same. */
const argumentsOf = (node: FieldNode): string =>
	(node.arguments ?? [])
		.map((arg) => `${arg.name.value}:${canonical(arg.value)}`)
		.toSorted()
		.join(',')

/** The fields of some sets by `key`, through fragments, each spread once. */
function collect(
	context: ValidationContext,
	sets: readonly At[],
	key: Key,
): ReadonlyMap<string, Same> {
	const found = new Map<string, [Found, ...Found[]]>()
	const spread = new Set<string>()
	const add = (set: SelectionSetNode | undefined, path: string): void => {
		for (const selection of set?.selections ?? []) {
			if (selection.kind === Kind.FIELD) {
				const field = { node: selection, path }
				const same = found.get(key(selection))
				if (same === undefined) found.set(key(selection), [field])
				else same.push(field)
			} else if (selection.kind === Kind.INLINE_FRAGMENT) {
				add(selection.selectionSet, path)
			} else if (!spread.has(selection.name.value)) {
				spread.add(selection.name.value)
				add(context.getFragment(selection.name.value)?.selectionSet, path)
			}
		}
	}
	for (const { set, path } of sets) add(set, path)
	return found
}

/** What some fields select, each set at its field's path. */
const below = (found: readonly Found[]): At[] =>
	found.flatMap((each) =>
		each.node.selectionSet === undefined
			? []
			: [{ set: each.node.selectionSet, path: pathOf(each) }],
	)

/** The validation rule that refuses a relation read with two arguments. */
export function twiceRule(registry: Registry): ValidationRule {
	return (context) => {
		// Each set list is walked once: a fragment reached by many paths, or a
		// cycle `NoFragmentCyclesRule` refuses, costs one walk.
		const ids = new Map<SelectionSetNode, number>()
		const idOf = (set: SelectionSetNode) => {
			const id = ids.get(set) ?? ids.size
			ids.set(set, id)
			return id
		}
		const walked = new Set<string>()
		const refuse = (name: string, [first, ...others]: Same): void => {
			const asked = argumentsOf(first.node)
			// Under one path, graphql-js's own rule refuses them.
			const other = others.find(
				(each) =>
					argumentsOf(each.node) !== asked && pathOf(each) !== pathOf(first),
			)
			if (other === undefined) return
			context.reportError(
				new GraphQLError(
					`${name} is selected twice with different arguments, at ${pathOf(first)} and ${pathOf(other)}; read it once.`,
					{ nodes: [first.node, other.node] },
				),
			)
		}
		const walk = (
			type: GraphQLNamedType | null | undefined,
			sets: readonly At[],
			key: Key,
		): void => {
			if (!isObjectType(type)) return
			const list = sets.map(({ set }) => idOf(set)).join(',')
			const visit = `${type.name} ${key === byName} ${list}`
			if (walked.has(visit)) return
			walked.add(visit)
			const entry = registry.entries.get(type.name)
			for (const [name, found] of collect(context, sets, key)) {
				const field = type.getFields()[name]
				if (field === undefined) continue
				const child = getNamedType(field.type)
				if (entry === undefined) {
					walk(child, below(found), byName)
					continue
				}
				const relation = entry.model.fields.find((f) => f.name === name)
				const virtual = entry.exposed.virtuals.some((v) => v.name === name)
				const oneOf = oneOfsOf(entry.model).some((o) => o.name === name)
				if (virtual || relation?.kind === 'many') refuse(name, found)
				if (virtual || oneOf || relation !== undefined) {
					walk(child, below(found), byName)
					continue
				}
				// A field `extend` added resolves once per response path.
				const paths = Map.groupBy(found, pathOf)
				for (const same of paths.values()) walk(child, below(same), byName)
			}
		}
		return {
			OperationDefinition: (operation) => {
				const root = context.getSchema().getRootType(operation.operation)
				walk(root, [{ set: operation.selectionSet, path: '' }], responseKey)
			},
		}
	}
}
