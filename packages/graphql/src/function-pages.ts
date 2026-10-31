// A function's page (D-182): read with its field's page arguments as the
// model's generated list reads, its rows' relations read again as the
// caller, its count only when selected.
import {
	connection,
	pageArgs,
	pageOf,
	rowsOf,
	run,
} from '@ultimabase/http/internal'
import type { GraphQLOutputType, GraphQLResolveInfo } from 'graphql'
import { GraphQLList, GraphQLNonNull } from 'graphql'
import { Refused } from 'ultimabase'
import { pageSource } from 'ultimabase/internal'
import { connectionType, isMaster, objectType } from './outputs.ts'
import type { Args, Context, Registry } from './registry.ts'
import { reread } from './reread.ts'
import { rowNodes } from './select.ts'

/** A page's type: the model's connection, or a list of its rows. */
export function pageType(registry: Registry, model: string): GraphQLOutputType {
	if (registry.settings.pagination === 'list') {
		const row = new GraphQLNonNull(objectType(registry, model))
		return new GraphQLNonNull(new GraphQLList(row))
	}
	return new GraphQLNonNull(
		connectionType(registry, `${model}Connection`, model),
	)
}

/** A function's input arguments, none named like a page argument. */
export function inputOf(
	registry: Registry,
	owner: string,
	args: { readonly [name: string]: unknown },
): (sent: Args) => Args {
	const names = pageArgs(registry.settings.pagination)
	for (const name of names) {
		if (name in args) {
			throw new Refused(
				`${owner}: its input property ${name} is a page argument; rename it.`,
			)
		}
	}
	return (sent) =>
		Object.fromEntries(
			Object.entries(sent).filter(([name]) => !names.includes(name)),
		)
}

/** The page `value` holds, read as the field's arguments ask. */
export async function readPage(
	registry: Registry,
	model: string,
	value: unknown,
	call: {
		readonly name: string
		readonly args: Args
		readonly context: Context
		readonly info: GraphQLResolveInfo
	},
): Promise<unknown> {
	const { args, context, info } = call
	const source = pageSource(value, model)
	const entry = registry.entry(model)
	const { pagination } = registry.settings
	const { read, relay } = pageOf(pagination, entry, args, isMaster(context))
	const found = rowsOf(await run(async () => source.findMany(read)))
	const output = { kind: 'model', name: model, form: 'list' } as const
	// The row budget counted the page's rows before it ran.
	const limit = { name: call.name, take: found.length }
	const nodes = rowNodes(registry, info)
	const rows = await reread(
		registry,
		output,
		found,
		context,
		info,
		limit,
		nodes,
	)
	if (relay === undefined) return rows
	let counted: Promise<number> | undefined
	return {
		...connection(rowsOf(rows), relay, (row) => row),
		// Called by the default resolver, so counted only when selected,
		// and once however many aliases ask.
		totalCount: async () => {
			counted ??= run(async () => source.count())
			return counted
		},
	}
}
