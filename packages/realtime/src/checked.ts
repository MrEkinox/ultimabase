// What a live read may ask (D-154): its order sorts by the model's own
// fields, and its selection reaches only live models, each nested list with a
// take. A refusal names the argument it comes from.
import type { Caller, ExposedModel } from 'ultimabase'
import { PublicError } from 'ultimabase'
import type { LivePlan } from 'ultimabase/internal'
import { liveSchema } from 'ultimabase/internal'
import { modelsOf, stepOf } from './reach.ts'

export const invalid = (path: string, message: string): PublicError =>
	new PublicError('VALIDATION_FAILED', message, {
		details: { issues: [{ path: [path], message }] },
	})

/** Who `caller` is, which a rebuilt caller must keep. */
export const whoOf = (caller: Caller): string => {
	if (caller.kind !== 'user') return JSON.stringify(caller)
	const id: unknown = Reflect.get(caller.user, 'id')
	return JSON.stringify(['user', id])
}

/** Refuses one more live read past what a connection holds. */
export function holds(reads: number, maxSubscriptions: number): void {
	if (reads < maxSubscriptions) return
	throw invalid(
		'subscriptions',
		`A connection holds at most ${maxSubscriptions} live reads.`,
	)
}

/** Refuses `rows` past what a connection follows in all. */
export function fits(rows: number, maxConnectionRows: number): void {
	if (rows <= maxConnectionRows) return
	throw invalid(
		'first',
		`A connection follows at most ${maxConnectionRows} rows.`,
	)
}

/**
 * Refuses a live list opened with `rows` past `limit` (D-252); its details
 * give both (D-186).
 */
export function within(rows: number, limit: number): void {
	if (rows <= limit) return
	const message = `first is over ${limit}, the most a live list follows.`
	const details = { issues: [{ path: ['first'], message }], limit, rows }
	throw new PublicError('VALIDATION_FAILED', message, { details })
}

/**
 * Refuses an order that reads another row and a selection that reaches a
 * model which is not live.
 */
export function checked(
	exposed: readonly ExposedModel[],
	model: string,
	plan: Omit<LivePlan, 'where' | 'filter' | 'rights'>,
	path: string,
): void {
	for (const order of plan.orderBy) {
		if (order.through ?? order.count ?? order.relevance) {
			throw invalid(
				'orderBy',
				`A live list sorts by ${model}'s own fields: ${order.field} reads another row.`,
			)
		}
	}
	const models = modelsOf(liveSchema())
	const live = (target: string, at: string): void => {
		const used = exposed.find(({ schema }) => schema.name === target)
		if (!used?.used) throw invalid(at, `${target} is not live.`)
	}
	for (const [name, inner] of Object.entries(plan.include ?? {})) {
		const step = stepOf(models, model, name)
		if (step === undefined) continue
		const at = `${path}.${name}`
		live(step.target, at)
		checked(exposed, step.target, { ...inner, orderBy: [] }, at)
		if (step.many && inner.take === undefined) {
			throw invalid(at, `A live ${name} list needs a take.`)
		}
	}
	for (const name of Object.keys(plan.count ?? {})) {
		const step = stepOf(models, model, name)
		if (step !== undefined) live(step.target, `${path}._count.${name}`)
	}
}
