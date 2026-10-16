// `.with((plugins) => plugins.access({ … }).rest({ … }))` (ADR-0339): one
// builder method per rules key of the installed plugins plus Core's
// `relations`, generated without naming a plugin.
import { immutableRecord } from '@ultimabase/shared'

declare const missingRequiredRules: unique symbol

/** What the `.with` callback must return: a builder that set every required rule. */
export interface CompleteSchemaRules {
	readonly [missingRequiredRules]: never
}

// Keyed by a parameter constrained to the rule names, as `Pick` is, so each
// method keeps the documentation of the `.with` entry of the same name.
type SchemaRuleMethods<
	TMissing extends PropertyKey,
	TRules,
	TCalled extends PropertyKey,
	TNames extends keyof TRules,
> = {
	readonly [TName in TNames]-?: (
		rule: Exclude<TRules[TName], undefined>,
	) => SchemaRulesBuilder<Exclude<TMissing, TName>, TRules, TCalled | TName>
}

/**
 * The `plugins` parameter of `.with((plugins) => …)`: one method per rule,
 * typed like the entry of the same name, each callable once. `TMissing`
 * names the required rules not set yet (`acl` once `acl: true`).
 */
export type SchemaRulesBuilder<
	TMissing extends PropertyKey,
	TRules,
	TCalled extends PropertyKey = never,
> = SchemaRuleMethods<
	TMissing,
	TRules,
	TCalled,
	Exclude<keyof TRules, TCalled>
> &
	Readonly<Record<typeof missingRequiredRules, MissingRuleMessage<TMissing>>>

// Printed by the diagnostic of a `.with` callback that misses a required rule.
type MissingRuleMessage<TMissing extends PropertyKey> = TMissing extends string
	? `plugins.${TMissing}({ … }) is required by a feature set in define()`
	: never

/** The callback of `.with`, which must set the rules in `TRequired`. */
export type SchemaRulesCallback<TRules, TRequired extends PropertyKey> = (
	plugins: SchemaRulesBuilder<TRequired, TRules>,
) => CompleteSchemaRules

const recordedRules = new WeakMap<object, readonly [string, unknown][]>()

// Errors the builder throws itself, already worded for the developer.
const builderErrors = new WeakSet<object>()

const builderError = (message: string): TypeError => {
	const error = new TypeError(message)
	builderErrors.add(error)
	return error
}

const createRulesBuilder = (
	names: readonly string[],
	entries: readonly [string, unknown][],
): object => {
	const builder = immutableRecord(
		Object.fromEntries(
			names.map((name) => [
				name,
				(rule: unknown): object => {
					if (entries.some(([key]) => key === name)) {
						throw builderError(
							`.with((plugins) => …) sets each rule once: plugins.${name}(…) is called twice`,
						)
					}
					return createRulesBuilder(names, [...entries, [name, rule]])
				},
			]),
		),
	)
	recordedRules.set(builder, entries)
	return builder
}

/**
 * @internal Runs the callback form of `.with` against a builder with one
 * method per rule name, declared when the factory was configured, and
 * returns the rules it set. `plugins` has no method for a rule no installed
 * plugin declares: from JavaScript, calling one is the engine's `TypeError`
 * (`plugins.audit is not a function`), rethrown with the available rules.
 */
export const collectSchemaRules = (
	callback: (plugins: unknown) => unknown,
	names: readonly string[],
	className: string,
): Readonly<Record<string, unknown>> => {
	let result: unknown
	try {
		result = callback(createRulesBuilder(names, []))
	} catch (error: unknown) {
		if (!(error instanceof TypeError) || builderErrors.has(error)) throw error
		throw new TypeError(
			`${error.message} in ${className}.with((plugins) => …): plugins offers ${names.join(', ')}; a rule needs the plugin that declares it`,
			{ cause: error },
		)
	}
	const entries =
		typeof result === 'object' && result !== null
			? recordedRules.get(result)
			: undefined
	if (entries === undefined) {
		throw builderError(
			'.with((plugins) => …) must return the plugins builder, such as (plugins) => plugins.access({ … })',
		)
	}
	// Rule names come from installed plugins; entries are copied as entries.
	return Object.fromEntries(entries)
}
