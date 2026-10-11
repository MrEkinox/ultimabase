import type { CompiledSchemaRegistry } from '@ultimabase/core'
import {
	contributeApplication,
	type PluginApplicationContribution,
} from '@ultimabase/core/plugin'

import type { AllowWithoutRulePlan } from './authoring/allow-without-rule.js'
import type { SchemaAccessDeclarations } from './authoring/declarations.js'

const describeKey = (key: string): string => {
	switch (key) {
		case 'all':
			return 'every operation and request plugin command'
		case 'read':
			return 'read (one, many, count, exists)'
		case 'write':
			return 'write (create, update, upsert, delete and request plugin commands)'
		default:
			return key
	}
}

const describeValue = (
	value: AllowWithoutRulePlan['openings'][number]['value'],
): string =>
	value === true
		? 'for every caller, production included'
		: value === 'development'
			? "for every caller, outside production only ('development')"
			: `when predicate ${value.name === '' ? '(anonymous)' : value.name} allows`

/**
 * Fails `start()` in production when `allowWithoutRule` uses `'development'`
 * (ADR-0312), naming the operations it would open.
 */
export const assertProductionOpenings = (
	allowWithoutRule: AllowWithoutRulePlan,
): void => {
	if (allowWithoutRule.environment !== 'production') return
	const keys = allowWithoutRule.openings
		.filter(({ value }) => value === 'development')
		.map(({ key }) => describeKey(key))
	if (keys.length === 0) return
	throw new TypeError(
		`Access allowWithoutRule opens ${keys.join('; ')} with 'development', which production refuses (NODE_ENV is production). Write schema rules, or use true to open them in production too.`,
	)
}

/** One `warn` line per opening, production included (ADR-0313). */
export const describeOpenings = (
	allowWithoutRule: AllowWithoutRulePlan,
): readonly string[] =>
	allowWithoutRule.openings
		.filter(
			({ value }) =>
				value !== 'development' ||
				allowWithoutRule.environment !== 'production',
		)
		.map(
			({ key, value }) =>
				`allowWithoutRule.${key} opens ${describeKey(key)} on schemas without a rule, ${describeValue(value)}.`,
		)

// Inline options were normalized by the option definitions in `options.ts`.
const readSchemaAccess = (options: object): unknown =>
	Object.hasOwn(options, 'access') ? Reflect.get(options, 'access') : undefined

/** Lists the schemas whose declaration has no operation or command rule. */
export const listSchemasWithoutRule = (
	schemas: CompiledSchemaRegistry,
): readonly string[] =>
	schemas
		.values()
		.filter((schema) => {
			const access = readSchemaAccess(schema.definition) as
				SchemaAccessDeclarations | undefined
			return (
				access?.operation === undefined &&
				Object.keys(access?.extensions ?? {}).length === 0
			)
		})
		.map(({ className }) => className)

/**
 * Starts Access: refuses `'development'` openings in production, then logs one
 * `warn` line per opening and one `info` line listing the schemas without any
 * rule (ADR-0317, decisions 2 and 6).
 */
export const contributeAccessStartup = (
	allowWithoutRule: AllowWithoutRulePlan,
): PluginApplicationContribution<void> =>
	contributeApplication(({ schemas }) => ({
		startRuntime: ({ logger }) => {
			assertProductionOpenings(allowWithoutRule)
			for (const line of describeOpenings(allowWithoutRule)) logger.warn(line)
			const bare = listSchemasWithoutRule(schemas)
			if (bare.length > 0) {
				logger.info(
					`schemas without an Access rule, denied unless allowWithoutRule opens them: ${bare.join(', ')}.`,
				)
			}
		},
	}))
