// The row a write plans (query-write.ts): where its data sits, the steps
// around its own, and the checks of its scalar and `one` values.
import type { Many, Resolving } from './nested-write.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import type { QueryScope } from './scope.ts'
import type { Draft } from './write-data.ts'
import { issueOf } from './write-data.ts'
import type { Plan, Reads, Step } from './write-plan.ts'
import { byId, byIds, modelOf } from './query-where.ts'

export type Relation = Extract<FieldInfo, { readonly kind: 'one' | 'many' }>

export type Context = {
	readonly scope: QueryScope
	readonly model: ModelInfo
	readonly id: string
	readonly plan: Plan
	readonly reads: Reads
	/** The data the caller sent, before defaults and hooks. */
	readonly sent: Readonly<Draft>
	readonly set: { [field: string]: unknown }
	/** The steps that run before the row's own: the rows it points to. */
	readonly before: Step[]
	/** The steps that run after the row's own. */
	readonly after: Step[]
	/** Where the row's data sits in the write's `data` (D-128). */
	readonly at: readonly (string | number)[]
}

export function fail(
	context: Context,
	path: readonly string[],
	message: string,
): void {
	context.plan.issues.push({ path: [...context.at, ...path], message })
}

export const pathOf = (context: Context, name: string): string =>
	['data', ...context.at, name].join('.')

/**
 * A relation value the caller did not send, a default's or a hook's, skips
 * access rules (D-67); `beforeFind` still applies (D-71).
 */
export function trusted(
	context: Context,
	field: FieldInfo,
	value: unknown,
): boolean {
	return (
		!Object.hasOwn(context.sent, field.name) ||
		context.sent[field.name] !== value
	)
}

/** The row's relation values, resolved as the caller or a hook sent them. */
export const resolving = (
	context: Context,
	skips: boolean,
	creating: boolean,
): Resolving => ({ ...context, trusted: skips, creating })

export function scalar(
	context: Context,
	field: FieldInfo,
	value: unknown,
): void {
	if (field.kind !== 'scalar') return
	if (value === null) {
		if (field.optional) context.set[field.name] = null
		else fail(context, [field.name], 'Required.')
		return
	}
	const { codec } = field
	// A plugin field is stored in the form its `encode` gives (D-122).
	const stored = codec === undefined ? value : codec.encode(value)
	const issue = issueOf(stored, field)
	const where = `${context.model.name}.${field.name}`
	if (issue !== undefined) {
		throw new TypeError(
			codec === undefined
				? `${where}: ${issue} A before hook or validate wrote it.`
				: `${where}: the ${codec.plugin} field type encoded a value its stored field refuses: ${issue}`,
		)
	}
	context.set[field.name] = stored
}

/** Whether a row of the other side, but `kept`, holds this one's key. */
export async function holds(
	context: Context,
	field: Extract<FieldInfo, { readonly kind: 'one' }>,
	kept: string | undefined,
): Promise<boolean> {
	const count = await context.reads.count({
		model: field.target,
		where: {
			[field.inverse]: { is: byId(context.id) },
			...(kept === undefined ? {} : { id: { not: kept } }),
		},
	})
	return count > 0
}

export const viaOf = (context: Context, field: Relation): string =>
	`${context.model.name}.${field.name}`

/** A `many` relation's link changes: its disconnects, then its connects. */
export function linking(
	context: Context,
	field: Extract<FieldInfo, { readonly kind: 'many' }>,
	write: Pick<Many, 'connect' | 'disconnect'>,
	made: readonly string[],
	skips: boolean,
): void {
	const { connect, disconnect } = write
	if (field.join) {
		const link = {
			model: context.model.name,
			field: field.name,
			id: context.id,
		}
		if (disconnect.length > 0) {
			context.after.push({
				kind: 'detach',
				...link,
				targets: disconnect,
				target: field.target,
				trusted: skips,
			})
		}
		const targets = [...connect, ...made]
		if (targets.length > 0) {
			context.after.push({ kind: 'link', ...link, targets })
		}
		return
	}
	const inverse = modelOf(context.scope.models, field.target).fields.get(
		field.inverse,
	)
	const move = {
		kind: 'move',
		model: field.target,
		field: field.inverse,
		via: viaOf(context, field),
		trusted: skips,
	} as const
	if (disconnect.length > 0) {
		if (inverse?.kind === 'one' && !inverse.optional) {
			fail(
				context,
				[field.name, 'disconnect'],
				`A ${field.target} cannot be left without its ${field.inverse}.`,
			)
		} else {
			context.after.push({
				...move,
				where: {
					...byIds(disconnect),
					[field.inverse]: { is: byId(context.id) },
				},
				to: null,
			})
		}
	}
	if (connect.length > 0) {
		context.after.push({ ...move, where: byIds(connect), to: context.id })
	}
}
