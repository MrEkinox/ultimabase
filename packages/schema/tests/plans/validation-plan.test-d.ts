import { expectTypeOf, test } from 'vitest'

import {
	bigintField,
	binaryField,
	compileValidationPlans,
	decimalField,
	dateTimeField,
	defineSchema,
	floatField,
	intField,
	stringField,
	timeField,
	type FieldValidationPlan,
	type ArrayValidationPlan,
	type BigintValidationPlan,
	type BinaryValidationPlan,
	type DateTimeValidationPlan,
	type DecimalValidationPlan,
	type FloatValidationPlan,
	type IntValidationPlan,
	type PluginFieldValidationPlan,
	type PluginValidationIssueCode,
	type RuntimeClockValidationDefaultPlan,
	type RuntimeValidationDefaultPlan,
	type SchemaValidationPlans,
	type StringValidationPlan,
	type TimeValidationPlan,
	type ValidationIssue,
	type ValidationIssueCode,
	type ValidationIssuePath,
	type ValidationOperation,
	type ValidationPresence,
} from '../../src/index.js'

test('exports discriminated operation and field plans', () => {
	const schema = defineSchema({
		className: 'User',
		fields: {
			name: stringField({
				validation: { required: true },
			}),
		},
	})
	const plans = compileValidationPlans(schema)
	const namePlan = plans.create.fields.name

	expectTypeOf(plans).toEqualTypeOf<SchemaValidationPlans>()
	expectTypeOf(plans.create.operation).toEqualTypeOf<ValidationOperation>()
	expectTypeOf(namePlan).toEqualTypeOf<FieldValidationPlan | undefined>()

	if (namePlan?.kind === 'string') {
		expectTypeOf(namePlan).toEqualTypeOf<StringValidationPlan>()
		expectTypeOf(namePlan.presence).toEqualTypeOf<ValidationPresence>()
	}
})

test('narrows integer and float plans as distinct kinds', () => {
	const schema = defineSchema({
		className: 'NumericPlan',
		fields: {
			largeCount: bigintField(),
			avatar: binaryField(),
			count: intField(),
			ratio: floatField(),
			processedAt: dateTimeField(),
			price: decimalField(),
			reminderTime: timeField(),
		},
	})
	const plans = compileValidationPlans(schema).create.fields
	const count = plans.count
	const largeCount = plans.largeCount
	const avatar = plans.avatar
	const ratio = plans.ratio
	const processedAt = plans.processedAt
	const price = plans.price
	const reminderTime = plans.reminderTime

	if (largeCount?.kind === 'bigint') {
		expectTypeOf(largeCount).toEqualTypeOf<BigintValidationPlan>()
	}

	if (avatar?.kind === 'binary') {
		expectTypeOf(avatar).toEqualTypeOf<BinaryValidationPlan>()
	}

	if (count?.kind === 'int') {
		expectTypeOf(count).toEqualTypeOf<IntValidationPlan>()
	}

	if (ratio?.kind === 'float') {
		expectTypeOf(ratio).toEqualTypeOf<FloatValidationPlan>()
	}

	if (processedAt?.kind === 'dateTime') {
		expectTypeOf(processedAt).toEqualTypeOf<DateTimeValidationPlan>()
	}

	if (price?.kind === 'decimal') {
		expectTypeOf(price).toEqualTypeOf<DecimalValidationPlan>()
	}

	if (reminderTime?.kind === 'time') {
		expectTypeOf(reminderTime).toEqualTypeOf<TimeValidationPlan>()
	}
})

test('narrows list wrappers independently from scalar field kinds', () => {
	const schema = defineSchema({
		className: 'TagList',
		fields: {
			tags: stringField({ list: [true, true] }),
		},
	})
	const tagsPlan = compileValidationPlans(schema).create.fields.tags

	if (tagsPlan?.kind === 'array') {
		expectTypeOf(tagsPlan).toEqualTypeOf<ArrayValidationPlan>()
		expectTypeOf(tagsPlan.items).toEqualTypeOf<FieldValidationPlan>()
	}
})

test('narrows opaque plugin plans without overlapping built-in kinds', () => {
	const assertPluginNarrowing = (plan: FieldValidationPlan): void => {
		if (plan.kind === 'plugin') {
			expectTypeOf(plan).toEqualTypeOf<PluginFieldValidationPlan>()
			expectTypeOf(plan.fieldKind).toEqualTypeOf<string>()
		}
	}

	// The parameter boundary verifies discrimination from the complete public union.
	assertPluginNarrowing({
		kind: 'plugin',
		fieldKind: 'fixture.custom',
		field: {
			kind: 'fixture.custom',
			options: {},
		},
		presence: 'optional',
		nullable: false,
	})
})

test('narrows default descriptors without unsafe result types', () => {
	const plan = {
		kind: 'runtime',
		factory: (): string => 'generated',
	} satisfies RuntimeValidationDefaultPlan

	expectTypeOf(plan.factory()).toEqualTypeOf<string>()
	expectTypeOf<
		RuntimeValidationDefaultPlan['factory']
	>().returns.toEqualTypeOf<unknown>()

	const clockPlan = {
		kind: 'runtimeClock',
		value: 'now',
	} satisfies RuntimeClockValidationDefaultPlan

	expectTypeOf(clockPlan.value).toEqualTypeOf<'now'>()
})

test('defines stable issue codes and nested paths', () => {
	const issue: ValidationIssue = {
		code: 'string.length.min',
		path: ['profile', 'tags', 0],
		message: 'Value is too short',
	}

	expectTypeOf(issue.code).toEqualTypeOf<ValidationIssueCode>()
	expectTypeOf(issue.path).toEqualTypeOf<ValidationIssuePath>()
	expectTypeOf(issue.message).toEqualTypeOf<string>()

	const invalidIssue: ValidationIssue = {
		// @ts-expect-error -- Validation codes are a closed stable contract.
		code: 'custom.failure',
		path: [],
		message: 'Unsupported code',
	}

	expectTypeOf(invalidIssue).toEqualTypeOf<ValidationIssue>()

	const pluginIssue: ValidationIssue<
		PluginValidationIssueCode<'fixture.vector'>
	> = {
		code: 'fixture.vector.dimension',
		path: ['embedding'],
		message: 'Vector dimension is invalid',
	}

	expectTypeOf(pluginIssue.code).toEqualTypeOf<
		PluginValidationIssueCode<'fixture.vector'>
	>()
})
