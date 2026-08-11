import { createApplication, definePlugin } from '../../foundation.js'
import { beforeOperation } from './definitions.js'
import { getHookHandlerEntries } from '../../schema/hooks/normalization.js'
import { objectField, Schema, stringField } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import {
	compileNativeHookContributionPlan,
	type HookContribution,
} from './contribution-plan.js'

let invocationCount = 0
const developerFieldHandler = ({
	value,
}: {
	readonly value: string | null
}) => {
	invocationCount += 1
	return value
}
const baseFieldHandler = ({ value }: { readonly value: unknown }) => {
	invocationCount += 1
	return value
}
const dependentFieldHandler = ({ value }: { readonly value: unknown }) => {
	invocationCount += 1
	return value
}

const sharedField = stringField({
	hooks: { resolveInput: developerFieldHandler },
})

const planFields = {
	first: sharedField,
	second: sharedField,
	profile: objectField({
		fields: {
			email: stringField({
				hooks: { resolveInput: developerFieldHandler },
			}),
		},
	}),
	'dotted.name': stringField(),
}
/** Creates distinct transform identities while preserving each exact operation. */
const createSchemaHandler = () => () => {
	invocationCount += 1
}

const developerSchemaHandler = createSchemaHandler()
const baseSchemaHandler = createSchemaHandler()
const baseSecondSchemaHandler = createSchemaHandler()
const dependentSchemaHandler = createSchemaHandler()

const planSchema = Schema.define({
	className: 'HookContributionPlan',
	fields: () => planFields,
	hooks: { beforeOperation: { create: developerSchemaHandler } },
})

const basePlugin = definePlugin({
	version: '0.0.0',
	core: '^0.0.0',
	pluginId: 'fixture.plan-base',
	privileges: [
		{
			name: 'runtime:intercept',
			reason: 'Registers native hook contributions for plan tests.',
		},
	],
	setup: ({ hooks, runtime }) => {
		hooks.schema('schema-first', planSchema, {
			beforeOperation: { create: baseSchemaHandler },
		})
		hooks.schema('schema-second', planSchema, {
			beforeOperation: { create: baseSecondSchemaHandler },
		})
		hooks.field('field-first', planSchema, ['profile', 'email'], {
			resolveInput: baseFieldHandler,
		})
		hooks.field('dotted', planSchema, ['dotted.name'], {
			resolveInput: baseFieldHandler,
		})

		// Low-level ADR-0070 hooks remain outside the native declaration plan.
		runtime.register(
			'fixture.plan-low-level',
			beforeOperation({ handler: () => undefined }),
		)
	},
})

const dependentPlugin = definePlugin({
	version: '0.0.0',
	core: '^0.0.0',
	pluginId: 'fixture.plan-dependent',
	privileges: [
		{
			name: 'runtime:intercept',
			reason: 'Registers native hook contributions for plan tests.',
		},
	],
	dependencies: [{ pluginId: 'fixture.plan-base', version: '^0.0.0' }],
	setup: ({ hooks }) => {
		hooks.schema('schema-dependent', planSchema, {
			beforeOperation: { create: dependentSchemaHandler },
		})
		hooks.field('field-dependent', planSchema, ['profile', 'email'], {
			resolveInput: dependentFieldHandler,
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
			fields: (field) => ({ title: field.string() }),
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
