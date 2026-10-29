// What a live read may ask (D-154): its order sorts by the model's own
// fields, and its selection reaches only live models, each nested list with a
// take. A refusal names the argument it comes from.
import type { ExposedModel } from 'ultimabase'
import { PublicError } from 'ultimabase'
import type { LivePlan } from 'ultimabase/internal'
import { liveSchema } from 'ultimabase/internal'
import { modelsOf, stepOf } from './reach.ts'

export const invalid = (path: string, message: string): PublicError =>
	new PublicError('VALIDATION_FAILED', message, {
		details: { issues: [{ path: [path], message }] },
	})

/**
 * Refuses an order that reads another row and a selection that reaches a
 * model which is not live; returns the nested rows each root row follows.
 */
export function checked(
	exposed: readonly ExposedModel[],
	model: string,
	plan: Omit<LivePlan, 'where' | 'rights'>,
	path: string,
): number {
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
	let rows = 0
	for (const [name, inner] of Object.entries(plan.include ?? {})) {
		const step = stepOf(models, model, name)
		if (step === undefined) continue
		const at = `${path}.${name}`
		live(step.target, at)
		const below = checked(exposed, step.target, { ...inner, orderBy: [] }, at)
		if (!step.many) {
			rows += below
			continue
		}
		if (inner.take === undefined) {
			throw invalid(at, `A live ${name} list needs a take.`)
		}
		rows += Math.abs(inner.take) * (1 + below)
	}
	for (const name of Object.keys(plan.count ?? {})) {
		const step = stepOf(models, model, name)
		if (step !== undefined) live(step.target, `${path}._count.${name}`)
	}
	return rows
}
