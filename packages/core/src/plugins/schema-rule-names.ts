import { isUnknownArray } from '@ultimabase/shared'

import type { PluginDefinition, PluginSource } from './definition.js'
import type { SchemaRulesHKT } from './schema-extensions.js'

/**
 * Keys no plugin may contribute as a feature or a rule: Core's `define` keys,
 * its `relations` rule and the `with` call itself (ADR-0339).
 */
const reservedSchemaKeys: ReadonlySet<string> = new Set([
	'className',
	'fields',
	'indexes',
	'relations',
	'with',
])

const ruleNamePattern = /^[A-Za-z_$][\w$]*$/u

/** @internal Rejects a feature or rule named after a reserved key. */
export const assertUnreservedSchemaKey = (
	kind: 'feature' | 'rule',
	name: string,
): void => {
	if (reservedSchemaKeys.has(name)) {
		throw new TypeError(
			`A plugin cannot declare the schema ${kind} ${name}: className, fields, indexes, relations and with are reserved by Core`,
		)
	}
}

type UnionToIntersection<TValue> = (
	TValue extends unknown ? (value: TValue) => void : never
) extends (value: infer TIntersection) => void
	? TIntersection
	: never

type SourceRulesSlot<TSource> =
	TSource extends Readonly<{
		schemaRules: infer TRules
	}>
		? TRules
		: never

// The rule names a plugin's rules slot can give, whatever the schema.
type DeclaredRuleName<TSource> =
	UnionToIntersection<SourceRulesSlot<TSource>> extends infer TSlot
		? TSlot extends SchemaRulesHKT
			? keyof (TSlot & {
					readonly schema: unknown
					readonly shape: Readonly<Record<string, readonly []>>
				})['rules'] &
					string
			: never
		: never

const ruleNamesByPlugin = new WeakMap<PluginDefinition, readonly string[]>()

/**
 * Declares, when the plugin is created, the rules its rules slot adds to
 * `.with({ … })` (ADR-0339): `.with` accepts these keys, checked without
 * reading any schema. Returns the same plugin instance.
 *
 * @example `provideSchemaRules(instance, ['audit'])`
 */
export const provideSchemaRules = <
	TPlugin extends PluginDefinition,
	TSource = PluginSource<TPlugin>,
>(
	plugin: TPlugin,
	names: readonly DeclaredRuleName<TSource>[],
): TPlugin => {
	const untrusted: unknown = names
	if (
		!isUnknownArray(untrusted) ||
		untrusted.some(
			(name) => typeof name !== 'string' || !ruleNamePattern.test(name),
		)
	) {
		throw new TypeError('schema rule names must list identifiers')
	}
	ruleNamesByPlugin.set(plugin, Object.freeze(untrusted.map(String)))
	return plugin
}

/**
 * @internal Collects the rule names of one installed plugin tuple, in
 * installation order and once each. A rule named after a reserved key is
 * rejected.
 */
export const readSchemaRuleNames = (
	plugins: readonly PluginDefinition[],
): readonly string[] => {
	const names = new Set<string>()
	for (const plugin of plugins) {
		for (const name of ruleNamesByPlugin.get(plugin) ?? []) {
			assertUnreservedSchemaKey('rule', name)
			names.add(name)
		}
	}
	return Object.freeze([...names])
}
