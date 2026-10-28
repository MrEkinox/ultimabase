// A function's output as the client reads it (D-109): its scalars as `run`
// returned them, its rows' relations re-read by id as the caller, in one
// query per model and only when a relation is selected.
import { badInput, rowsOf, run } from '@ultimabase/http/internal'
import type { FieldNode, GraphQLResolveInfo } from 'graphql'
import type { ExposedOutput } from 'ultimabase'
import { isMaster, objectType } from './outputs.ts'
import type { Args, Context, Registry } from './registry.ts'
import { as } from './registry.ts'
import type { Fields } from './select.ts'
import { grouped, selectOf } from './select.ts'

type Row = { [field: string]: unknown }
type Named = Exclude<ExposedOutput, { readonly kind: 'schema' }>
/** The rows of one model to re-read, and the relations they select. */
type Pending = {
	readonly select: { [relation: string]: unknown }
	readonly rows: Map<string, Row[]>
}

const isRecord = (value: unknown): value is object =>
	typeof value === 'object' && value !== null

/** `run`'s value, its rows' relations read as the caller. */
export async function reread(
	registry: Registry,
	output: ExposedOutput,
	value: unknown,
	context: Context,
	info: GraphQLResolveInfo,
	call: { readonly name: string; readonly take: number },
): Promise<unknown> {
	const master = isMaster(context)
	// The rows whose relations are read, which the row budget counts.
	let counted = 0
	const pending = new Map<string, Pending>()
	// A list's items share their nodes: each selection is read once.
	const relations = new Map<readonly FieldNode[], Args>()
	const fields = new Map<readonly FieldNode[], ReadonlyMap<string, Fields>>()

	const relationsOf = (model: string, nodes: readonly FieldNode[]): Args => {
		const known = relations.get(nodes)
		if (known !== undefined) return known
		const type = objectType(registry, model)
		const select = selectOf(registry, info, type, nodes, master)
		const found = Object.fromEntries(
			Object.entries(select).filter(([, read]) => read !== true),
		)
		relations.set(nodes, found)
		return found
	}

	const fieldsOf = (nodes: readonly FieldNode[]) => {
		const known = fields.get(nodes)
		if (known !== undefined) return known
		const found = grouped(info, nodes)
		fields.set(nodes, found)
		return found
	}

	const row = (model: string, item: object, nodes: readonly FieldNode[]) => {
		const select = relationsOf(model, nodes)
		if (Object.keys(select).length === 0) return item
		const copy: Row = { ...item }
		const { id } = copy
		if (typeof id !== 'string') {
			throw new TypeError(`A ${model} was returned without its id.`)
		}
		const reading: Pending = pending.get(model) ?? {
			select: {},
			rows: new Map(),
		}
		pending.set(model, reading)
		for (const [name, read] of Object.entries(select)) {
			const known = reading.select[name]
			if (
				known !== undefined &&
				JSON.stringify(known) !== JSON.stringify(read)
			) {
				throw badInput(
					`${model}.${name} is selected in two ways; select it the same way everywhere.`,
				)
			}
			reading.select[name] = read
		}
		reading.rows.set(id, [...(reading.rows.get(id) ?? []), copy])
		counted += 1
		return copy
	}

	const one = (named: Named, item: unknown, nodes: readonly FieldNode[]) => {
		if (!isRecord(item)) return item
		if (named.kind === 'model') return row(named.name, item, nodes)
		const copy: Row = { ...item }
		const selected = fieldsOf(nodes)
		for (const [name, field] of named.type.fields) {
			const below = selected.get(name)
			if (below !== undefined) {
				copy[name] = walk(field, Reflect.get(item, name), below)
			}
		}
		return copy
	}

	const walk = (
		at: ExposedOutput,
		item: unknown,
		nodes: readonly FieldNode[],
	): unknown => {
		if (at.kind === 'schema') return item
		if (at.form !== 'list' || !Array.isArray(item)) {
			return one(at, item, nodes)
		}
		const before = counted
		const items = item.map((each: unknown) => one(at, each, nodes))
		// The budget counts `take` rows in a list (D-109).
		if (items.length > call.take && counted > before) {
			throw new RangeError(
				`${call.name} returned ${items.length} rows; a list counts take (${call.take}) rows, so it holds no more under a selected relation.`,
			)
		}
		return items
	}

	const result = walk(output, value, info.fieldNodes)
	for (const [model, { select, rows }] of pending) {
		const entry = registry.entry(model)
		const ids = [...rows.keys()]
		const read = await run(() =>
			entry.exposed.queries.findMany(
				{
					where: { id: { in: ids } },
					take: ids.length,
					select: { id: true, ...select },
				},
				as(context),
			),
		)
		const byId = new Map(rowsOf(read).map((found) => [found.id, found]))
		for (const [id, copies] of rows) {
			const found = byId.get(id)
			for (const name of Object.keys(select)) {
				// A row the caller cannot read has no relations (D-109).
				const many = entry.model.fields.some(
					(field) => field.name === name && field.kind === 'many',
				)
				const empty = many ? [] : null
				const relation = found === undefined ? empty : Reflect.get(found, name)
				for (const copy of copies) copy[name] = relation
			}
		}
	}
	return result
}
