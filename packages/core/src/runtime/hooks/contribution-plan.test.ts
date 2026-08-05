import { createApplication, definePlugin } from '../../foundation.js'
import { beforeOperation } from './definitions.js'
import { getHookHandlerEntries } from '../../schema/hooks/normalization.js'
import {
	objectField,
	Schema,
	stringField,
	type SchemaBeforeCreateHook,
	type SchemaClass,
} from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import {
	compileNativeHookContributionPlan,
	type HookContribution,
} from './contribution-plan.js'

let invocationCount = 0
const developerFieldHandler = (): void => {
	invocationCount += 1
}
const baseFieldHandler = (): void => {
	invocationCount += 1
}
const dependentFieldHandler = (): void => {
	invocationCount += 1
}

const sharedField = stringField({
	hooks: { beforeCreate: developerFieldHandler },
})

const planFields = {
	first: sharedField,
	second: sharedField,
	profile: objectField({
		fields: {
			email: stringField({
				hooks: { beforeCreate: developerFieldHandler },
			}),
		},
	}),
	'dotted.name': stringField(),
}
type PlanSchemaDefinition = SchemaClass<
	'HookContributionPlan',
	typeof planFields,
	readonly []
>

/** Creates distinct transform identities while preserving each exact operation. */
const createSchemaHandler =
	(): SchemaBeforeCreateHook<PlanSchemaDefinition> =>
	({ operation }) => {
		invocationCount += 1

		return operation
	}

const developerSchemaHandler = createSchemaHandler()
const baseSchemaHandler = createSchemaHandler()
const baseSecondSchemaHandler = createSchemaHandler()
const dependentSchemaHandler = createSchemaHandler()

const planSchema = Schema.define({
	className: 'HookContributionPlan',
	fields: planFields,
	hooks: { beforeCreate: developerSchemaHandler },
})

const basePlugin = definePlugin({
	name: 'fixture.plan-base',
	setup: ({ hooks, registries }) => {
		hooks.schema('schema-first', planSchema, {
			beforeCreate: baseSchemaHandler,
		})
		hooks.schema('schema-second', planSchema, {
			beforeCreate: baseSecondSchemaHandler,
		})
		hooks.field('field-first', planSchema, ['profile', 'email'], {
			beforeCreate: baseFieldHandler,
		})
		hooks.field('dotted', planSchema, ['dotted.name'], {
			beforeCreate: baseFieldHandler,
		})

		// Low-level ADR-0070 hooks remain outside the native declaration plan.
		registries.hooks.register(
			'fixture.plan-low-level',
			beforeOperation({ handler: ({ operation }) => ({ operation }) }),
		)
	},
})

const dependentPlugin = definePlugin({
	name: 'fixture.plan-dependent',
	dependencies: ['fixture.plan-base'],
	setup: ({ hooks }) => {
		hooks.schema('schema-dependent', planSchema, {
			beforeCreate: dependentSchemaHandler,
		})
		hooks.field('field-dependent', planSchema, ['profile', 'email'], {
			beforeCreate: dependentFieldHandler,
		})
	},
})

const contributionNames = <TDeclarations extends object>(
	contributions: readonly HookContribution<TDeclarations>[],
): readonly string[] =>
	contributions.map((contribution) =>
		contribution.kind === 'developer'
			? 'developer'
			: `${contribution.ownerPlugin}:${contribution.localName}`,
	)

describe('native hook contribution plan', () => {
	it('precomputes plugin wrapping and developer unwinding without executing hooks', async () => {
		invocationCount = 0
		const application = await createApplication({
			plugins: [dependentPlugin, basePlugin],
			schemas: [planSchema],
		})
		const plan = compileNativeHookContributionPlan(application)
		const schemaPlan = plan.getSchema(planSchema)

		expect(schemaPlan).toBeDefined()
		expect(
			contributionNames(schemaPlan?.contributions.before ?? []),
		).toStrictEqual([
			'fixture.plan-base:schema-first',
			'fixture.plan-base:schema-second',
			'fixture.plan-dependent:schema-dependent',
			'developer',
		])
		expect(
			contributionNames(schemaPlan?.contributions.after ?? []),
		).toStrictEqual([
			'developer',
			'fixture.plan-dependent:schema-dependent',
			'fixture.plan-base:schema-second',
			'fixture.plan-base:schema-first',
		])
		expect(invocationCount).toBe(0)

		const developer = schemaPlan?.contributions.before.at(-1)
		expect(developer?.kind).toBe('developer')
		expect(
			getHookHandlerEntries(developer?.declarations, 'beforeCreate').map(
				({ handler }) => handler,
			),
		).toStrictEqual([developerSchemaHandler])
	})

	it('indexes deterministic nested paths and repeated field identities', async () => {
		const application = await createApplication({
			plugins: [dependentPlugin, basePlugin],
			schemas: [planSchema],
		})
		const plan = compileNativeHookContributionPlan(application)
		const schemaPlan = plan.getSchema(planSchema)
		const email = plan.getField(planSchema, ['profile', 'email'])
		const dotted = plan.getField(planSchema, ['dotted.name'])
		const shared = plan.getFields(planSchema, sharedField)

		expect(schemaPlan?.fieldsBefore.map(({ path }) => path)).toStrictEqual([
			['first'],
			['second'],
			['profile', 'email'],
			['dotted.name'],
		])
		expect(schemaPlan?.fieldsAfter.map(({ path }) => path)).toStrictEqual([
			['dotted.name'],
			['profile', 'email'],
			['second'],
			['first'],
		])
		expect(shared.map(({ path }) => path)).toStrictEqual([
			['first'],
			['second'],
		])
		expect(contributionNames(email?.contributions.before ?? [])).toStrictEqual([
			'fixture.plan-base:field-first',
			'fixture.plan-dependent:field-dependent',
			'developer',
		])
		expect(contributionNames(email?.contributions.after ?? [])).toStrictEqual([
			'developer',
			'fixture.plan-dependent:field-dependent',
			'fixture.plan-base:field-first',
		])
		expect(dotted?.path).toStrictEqual(['dotted.name'])
		expect(plan.getField(planSchema, ['dotted', 'name'])).toBeUndefined()
	})

	it('returns deeply immutable application-owned plan views', async () => {
		const application = await createApplication({
			plugins: [basePlugin],
			schemas: [planSchema],
		})
		const plan = compileNativeHookContributionPlan(application)
		const schemaPlan = plan.getSchema(planSchema)
		const fieldPlan = plan.getField(planSchema, ['profile', 'email'])
		const foreignSchema = Schema.define({
			className: 'ForeignContributionPlan',
			fields: { title: stringField() },
		})

		expect(Object.isFrozen(plan)).toBe(true)
		expect(Object.isFrozen(plan.schemas)).toBe(true)
		expect(Object.isFrozen(schemaPlan)).toBe(true)
		expect(Object.isFrozen(schemaPlan?.contributions.before)).toBe(true)
		expect(Object.isFrozen(schemaPlan?.contributions.after)).toBe(true)
		expect(schemaPlan?.contributions.before.every(Object.isFrozen)).toBe(true)
		expect(Object.isFrozen(schemaPlan?.fieldsBefore)).toBe(true)
		expect(Object.isFrozen(schemaPlan?.fieldsAfter)).toBe(true)
		expect(Object.isFrozen(fieldPlan)).toBe(true)
		expect(Object.isFrozen(fieldPlan?.path)).toBe(true)
		expect(Object.isFrozen(plan.getFields(planSchema, sharedField))).toBe(true)
		expect(plan.getSchema(foreignSchema)).toBeUndefined()
		expect(plan.getFields(foreignSchema, sharedField)).toStrictEqual([])
	})

	it('rejects values that are not initialized framework applications', () => {
		expect(() => compileNativeHookContributionPlan(null as never)).toThrow(
			'Native hook contribution plans require a FrameworkApplication',
		)
	})
})
