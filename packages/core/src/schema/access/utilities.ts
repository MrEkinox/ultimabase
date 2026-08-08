import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { AccessContext } from '../../access/index.js'
import type {
	AccessDecisionRule,
	SchemaOperationAccessInput,
} from './contracts.js'

/**
 * Explicitly permits every request covered by one Access declaration.
 * @example `operation: { read: allowAll }`
 */
export const allowAll = true as const

/**
 * Explicitly rejects every request covered by one Access declaration.
 * @example `operation: { delete: denyAll }`
 */
export const denyAll = false as const

/** Represents the common cancellable boundary shared by every Access decision. */
export interface AccessDecisionInput {
	readonly context: AccessContext
}

type AccessDecisionCallback<TInput> = (
	input: TInput,
) => boolean | Promise<boolean>

const assertDecisionResult = (result: unknown): boolean => {
	if (typeof result !== 'boolean') {
		throw new TypeError('Access decision must return a boolean')
	}

	return result
}

const evaluateDecision = async <TInput extends AccessDecisionInput>(
	rule: AccessDecisionRule<TInput>,
	input: TInput,
): Promise<boolean> => {
	input.context.signal.throwIfAborted()
	const result =
		typeof rule === 'boolean' ? rule : await Promise.resolve(rule(input))
	input.context.signal.throwIfAborted()

	return assertDecisionResult(result)
}

const requireDecisions = <TInput extends AccessDecisionInput>(
	name: 'allOf' | 'anyOf',
	rules: readonly AccessDecisionRule<TInput>[],
): readonly AccessDecisionRule<TInput>[] => {
	if (rules.length === 0) {
		throw new TypeError(`${name} requires at least one Access decision`)
	}

	// One immutable setup-time snapshot prevents later array mutation from changing policy.
	return immutableArray(rules)
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
): AccessDecisionRule<TInput> => {
	const rules = requireDecisions('anyOf', decisions)

	if (rules.includes(true)) {
		return true
	}

	const effectiveRules = rules.filter((rule) => rule !== false)

	if (effectiveRules.length === 0) {
		return false
	}

	if (effectiveRules.length === 1) {
		return effectiveRules[0] as AccessDecisionRule<TInput>
	}

	const combined: AccessDecisionCallback<TInput> = async (input) => {
		for (const rule of effectiveRules) {
			if (await evaluateDecision(rule, input)) {
				return true
			}
		}

		return false
	}

	return combined
}

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
): AccessDecisionRule<TInput> => {
	const rules = requireDecisions('allOf', decisions)

	if (rules.includes(false)) {
		return false
	}

	const effectiveRules = rules.filter((rule) => rule !== true)

	if (effectiveRules.length === 0) {
		return true
	}

	if (effectiveRules.length === 1) {
		return effectiveRules[0] as AccessDecisionRule<TInput>
	}

	const combined: AccessDecisionCallback<TInput> = async (input) => {
		for (const rule of effectiveRules) {
			if (!(await evaluateDecision(rule, input))) {
				return false
			}
		}

		return true
	}

	return combined
}

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
