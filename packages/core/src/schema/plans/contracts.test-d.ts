import { expectTypeOf, test } from 'vitest'

import {
	compileValidationPlans,
	definePluginField,
	type ArrayValidationPlan,
	type FieldOptions,
	type FieldValidationPlan,
	type ObjectValidationPlan,
	type PluginValidationIssueCode,
	type ScalarValidationPlan,
	type SchemaValidationPlans,
	type ValidationIssue,
	type ValidationIssueCode,
	type ValidationIssuePath,
	type ValidationOperation,
	type ValidationPresence,
} from '../index.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

test('exports structural operation and field plans', () => {
	const schema = UltimaBase.Schema.define({
		className: 'User',
		fields: (field) => ({
			name: field.string({ required: true }),
			profile: field.object({ fields: (field) => ({ bio: field.string() }) }),
			tags: field.string({ list: true }),
		}),
	})
	const plans = compileValidationPlans(schema)
	const namePlan = plans.create.fields.name
	const profilePlan = plans.create.fields.profile
	const tagsPlan = plans.create.fields.tags

	expectTypeOf(plans).toEqualTypeOf<SchemaValidationPlans>()
	expectTypeOf(plans.create.operation).toEqualTypeOf<ValidationOperation>()
	expectTypeOf(namePlan).toEqualTypeOf<FieldValidationPlan | undefined>()

	if (namePlan?.kind === 'scalar') {
		expectTypeOf(namePlan).toEqualTypeOf<ScalarValidationPlan>()
		expectTypeOf(namePlan.presence).toEqualTypeOf<ValidationPresence>()
	}

	if (profilePlan?.kind === 'object') {
		expectTypeOf(profilePlan).toEqualTypeOf<ObjectValidationPlan>()
		expectTypeOf(profilePlan.fields).toEqualTypeOf<
			Readonly<Record<string, FieldValidationPlan>>
		>()
	}

	if (tagsPlan?.kind === 'array') {
		expectTypeOf(tagsPlan).toEqualTypeOf<ArrayValidationPlan>()
		expectTypeOf(tagsPlan.items).toEqualTypeOf<FieldValidationPlan>()
	}
})

test('preserves exact plugin fields through scalar plan generics', () => {
	type FixtureOptions = FieldOptions<string> & { readonly dimensions: 3 }

	const field = definePluginField<string, 'fixture.vector', FixtureOptions>(
		'fixture.vector',
		{ dimensions: 3 },
		{
			snapshotValue: (value: unknown): string => String(value),
		},
	)
	const plan: ScalarValidationPlan<typeof field> = {
		kind: 'scalar',
		field,
		presence: 'optional',
		nullable: false,
	}

	expectTypeOf(plan.field.options.dimensions).toEqualTypeOf<3>()
})

test('defines stable issue codes and nested paths', () => {
	const issue: ValidationIssue = {
		code: 'string.type',
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
