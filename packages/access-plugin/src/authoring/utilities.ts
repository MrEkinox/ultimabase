import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { AccessContext } from '../context.js'
import type {
	AccessDecisionRule,
	SchemaOperationAccessInput,
} from './contracts.js'

/**
 * Explicitly permits every request covered by one Access declaration.
 * @example `access: { read: allowAll }`
 */
export const allowAll = true as const

/**
 * Explicitly rejects every request covered by one Access declaration.
 * @example `access: { delete: denyAll }`
 */
export const denyAll = false as const

/** Represents the common cancellable boundary shared by every Access decision. */
export interface AccessDecisionInput {
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
 * @example `update: anyOf(isOwner("author"), hasRole(Editor))`
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

/** Represents one concise direct rule shared by named operation families. */
export type OperationAccessRule = AccessDecisionRule<SchemaOperationAccessInput>

/** Contains one direct decision for every native operation family. */
export interface AllOperationAccess {
	readonly read: OperationAccessRule
	readonly create: OperationAccessRule
	readonly update: OperationAccessRule
	readonly upsert: OperationAccessRule
	readonly delete: OperationAccessRule
}

/** Contains one direct decision for every native mutation family. */
export type AllMutationAccess = Readonly<Omit<AllOperationAccess, 'read'>>

/**
 * Applies one direct rule to every native operation family.
 *
 * Later object-spread properties override an individual family normally.
 * The returned record is a fresh immutable declaration and installs no
 * Runtime callback beyond the rule supplied by the developer.
 *
 * @example `{ ...allOperations(denyAll), read: allowAll }`
 */
export const allOperations = (rule: OperationAccessRule): AllOperationAccess =>
	immutableRecord({
		create: rule,
		delete: rule,
		read: rule,
		update: rule,
		upsert: rule,
	})

/**
 * Applies one direct rule to create, update, upsert, and delete families.
 *
 * The returned record deliberately has no `read` property. It is a fresh
 * immutable declaration whose entries retain the supplied callback identity.
 *
 * @example `{ read: allowAll, ...allMutations(denyAll) }`
 */
export const allMutations = (rule: OperationAccessRule): AllMutationAccess =>
	immutableRecord({
		create: rule,
		delete: rule,
		update: rule,
		upsert: rule,
	})
