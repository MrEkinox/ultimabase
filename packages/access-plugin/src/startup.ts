import {
	applicationOperationTransportPlanningCapability,
	type ApplicationExposurePlan,
	type CompiledSchemaRegistry,
} from '@ultimabase/core'
import {
	contributeApplication,
	optionalCapability,
	resolveCommandKey,
	type CapabilityRequirement,
	type PluginApplicationContribution,
} from '@ultimabase/core/plugin'

import type { AllowWithoutRulePlan } from './authoring/allow-without-rule.js'
import type { SchemaAccessDeclarations } from './authoring/declarations.js'

const describeKey = (key: string): string => {
	switch (key) {
		case 'all':
			return 'every operation and request plugin command'
		case 'read':
			return 'read (find, count, exists)'
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

/** Reads the exposure plans every installed transport asked for. */
export const exposurePlanningRequirement: CapabilityRequirement<
	typeof applicationOperationTransportPlanningCapability,
	true,
	'^1.0.0',
	'materialization'
> = optionalCapability(
	applicationOperationTransportPlanningCapability,
	'^1.0.0',
	{ phase: 'materialization' },
)

// Inline options were normalized by the option definitions in `options.ts`.
const readSchemaAccess = (options: object): unknown =>
	Object.hasOwn(options, 'access') ? Reflect.get(options, 'access') : undefined

/** Keeps the operation decision of each developer key, `false` included. */
const readDeveloperDecisions = (
	schemas: CompiledSchemaRegistry,
	className: string,
): Readonly<Record<string, unknown>> => {
	const definition = schemas.get(className)?.definition
	const access =
		definition === undefined
			? undefined
			: (readSchemaAccess(definition) as SchemaAccessDeclarations | undefined)
	return Object.fromEntries(
		Object.entries(access ?? {}).map(([key, { operation }]) => [
			key,
			operation,
		]),
	)
}

/**
 * Lists every method a transport serves that Access refuses to every
 * non-Master caller: no developer rule and no `allowWithoutRule` opening
 * decides it (ADR-0347 decision 4). Plugin rules only narrow, so they never
 * open a method. Master-authority commands are Master-only by design.
 */
export const listRefusedExposedMethods = (
	plans: readonly ApplicationExposurePlan[],
	schemas: CompiledSchemaRegistry,
	allowWithoutRule: AllowWithoutRulePlan,
): readonly string[] => {
	const refused = new Map<string, string>()
	for (const { className, methods } of plans.flatMap((plan) => plan.schemas)) {
		const decisions = readDeveloperDecisions(schemas, className)
		for (const { entry } of methods) {
			const name = `${className}.${entry.method}`
			if (
				refused.has(name) ||
				(entry.kind === 'plugin' && entry.authority !== 'request') ||
				resolveCommandKey(decisions, entry) !== undefined ||
				allowWithoutRule.resolve(entry) !== undefined
			) {
				continue
			}
			refused.set(
				name,
				`${name} is exposed but no Access rule opens it. Add an Access rule, open it in allowWithoutRule, or close it with expose: { ${entry.method}: false }.`,
			)
		}
	}
	return [...refused.values()]
}

/**
 * Starts Access: refuses `'development'` openings in production, logs one
 * `warn` line per opening (ADR-0317 decision 2), then reports the exposed
 * methods Access always refuses: one `warn` line each, or a failed start in
 * production (ADR-0347 decision 4).
 */
export const contributeAccessStartup = (
	allowWithoutRule: AllowWithoutRulePlan,
): PluginApplicationContribution<void> =>
	contributeApplication(({ capabilities, schemas }) => ({
		startRuntime: ({ logger }) => {
			assertProductionOpenings(allowWithoutRule)
			for (const line of describeOpenings(allowWithoutRule)) logger.warn(line)
			const plans =
				capabilities.get(exposurePlanningRequirement)?.readExposurePlans() ?? []
			const refused = listRefusedExposedMethods(
				plans,
				schemas,
				allowWithoutRule,
			)
			if (refused.length === 0) return
			if (allowWithoutRule.environment === 'production') {
				throw new TypeError(refused.join('\n'))
			}
			for (const line of refused) logger.warn(line)
		},
	}))
