import { expectTypeOf, test } from 'vitest'

import {
	compileValidationPlans,
	defineSchema,
	stringField,
	type FieldValidationPlan,
	type RuntimeValidationDefaultPlan,
	type SchemaValidationPlans,
	type StringValidationPlan,
	type ValidationIssue,
	type ValidationIssueCode,
	type ValidationIssuePath,
	type ValidationOperation,
	type ValidationPresence,
} from '../src/index.js'

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

test('narrows default descriptors without unsafe result types', () => {
	const plan = {
		kind: 'runtime',
		factory: (): string => 'generated',
	} satisfies RuntimeValidationDefaultPlan

	expectTypeOf(plan.factory()).toEqualTypeOf<string>()
	expectTypeOf<
		RuntimeValidationDefaultPlan['factory']
	>().returns.toEqualTypeOf<unknown>()
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
})
