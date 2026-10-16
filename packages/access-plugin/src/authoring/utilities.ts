import type { PolicyContext } from '@ultimabase/core'
import { immutableArray } from '@ultimabase/shared'

import type { AccessContext } from '../context.js'
import type { AccessDecisionRule } from './contracts.js'

/** Represents the common cancellable boundary shared by every Access decision. */
export interface AccessDecisionInput extends PolicyContext {
	readonly context: AccessContext
}

const evaluateDecision = async <TInput extends AccessDecisionInput>(
	rule: AccessDecisionRule<TInput>,
	input: TInput,
): Promise<boolean> => {
	input.context.signal.throwIfAborted()
	const result =
		typeof rule === 'boolean' ? rule : await Promise.resolve(rule(input))
	input.context.signal.throwIfAborted()
	if (typeof result !== 'boolean') {
		throw new TypeError('Access decision must return a boolean')
	}
	return result
}

/**
 * Short-circuits on the `absorbing` decision: `true` for OR, `false` for AND.
 * Static rules are folded at setup time; callbacks run in declaration order.
 */
const combineDecisions = <TInput extends AccessDecisionInput>(
	name: 'allOf' | 'anyOf',
	absorbing: boolean,
	decisions: readonly AccessDecisionRule<TInput>[],
): AccessDecisionRule<TInput> => {
	if (decisions.length === 0) {
		throw new TypeError(`${name} requires at least one Access decision`)
	}
	// One immutable setup-time snapshot prevents later array mutation from changing policy.
	const rules = immutableArray(decisions)
	if (rules.includes(absorbing)) return absorbing

	const effectiveRules = rules.filter((rule) => rule !== !absorbing)
	if (effectiveRules.length < 2) {
		// A single remaining rule is returned as-is, without a wrapper.
		for (const rule of effectiveRules) return rule
		return !absorbing
	}
	return async (input) => {
		for (const rule of effectiveRules) {
			if ((await evaluateDecision(rule, input)) === absorbing) return absorbing
		}
		return !absorbing
	}
}

/**
 * Allows when at least one decision allows, using deterministic short-circuit OR.
 *
 * This combines alternatives inside one rule. Separate native or plugin Access
 * contributions are still combined monotonically through AND by Runtime.
 *
 * @example `update: anyOf(hasRole(Editor), hasRole(Admin))`
 */
export const anyOf = <TInput extends AccessDecisionInput>(
	...decisions: readonly [
		AccessDecisionRule<TInput>,
		...AccessDecisionRule<TInput>[],
	]
): AccessDecisionRule<TInput> => combineDecisions('anyOf', true, decisions)

/**
 * Allows only when every decision allows, using deterministic short-circuit AND.
 *
 * This is local composition within one declaration and never broadens another
 * Access contribution that independently denied the operation.
 *
 * @example `delete: allOf(hasRole(Editor), isNotLocked)`
 */
export const allOf = <TInput extends AccessDecisionInput>(
	...decisions: readonly [
		AccessDecisionRule<TInput>,
		...AccessDecisionRule<TInput>[],
	]
): AccessDecisionRule<TInput> => combineDecisions('allOf', false, decisions)

/**
 * Inverts exactly one Access decision without changing contribution ordering.
 *
 * @example `create: not(isRegistrationClosed)`
 */
export const not = <TInput extends AccessDecisionInput>(
	...decisions: readonly [AccessDecisionRule<TInput>]
): AccessDecisionRule<TInput> => {
	const untrustedDecisions: readonly unknown[] = decisions

	if (untrustedDecisions.length !== 1) {
		throw new TypeError('not requires exactly one Access decision')
	}

	const rule = decisions[0]

	if (typeof rule === 'boolean') {
		return !rule
	}

	return async (input): Promise<boolean> =>
		!(await evaluateDecision(rule, input))
}
