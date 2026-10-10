import { expectTypeOf, test } from 'vitest'
import { defineEnum } from '../fields/builtins/shared-enum.js'

import type {
	GenericOutputDescriptor,
	OutputBuilder,
	OutputValue,
} from '../../index.js'

test('infers exact scalar nullability and list containers', () => {
	const output = undefined as unknown as OutputBuilder
	const optionalName = output.string()
	const name = output.string({ nullable: false })
	const optionalTags = output.string({ list: true })
	const tags = output.string({ list: true, nullable: false })
	const status = output.enum({
		nullable: false,
		values: ['draft', 'published'] as const,
	})

	expectTypeOf(optionalName).toExtend<GenericOutputDescriptor>()
	expectTypeOf(name).toExtend<GenericOutputDescriptor>()
	expectTypeOf(optionalTags).toExtend<GenericOutputDescriptor>()
	expectTypeOf(tags).toExtend<GenericOutputDescriptor>()
	expectTypeOf(status).toExtend<GenericOutputDescriptor>()
	expectTypeOf<OutputValue<typeof optionalName>>().toEqualTypeOf<
		string | null
	>()
	expectTypeOf<OutputValue<typeof name>>().toEqualTypeOf<string>()
	expectTypeOf<OutputValue<typeof optionalTags>>().toEqualTypeOf<
		readonly string[] | null
	>()
	expectTypeOf<OutputValue<typeof tags>>().toEqualTypeOf<readonly string[]>()
	expectTypeOf<OutputValue<typeof status>>().toEqualTypeOf<
		'draft' | 'published'
	>()
})

test('infers recursive objects with required nullable properties', () => {
	const output = undefined as unknown as OutputBuilder
	const summary = output.object({
		fields: (nested) => ({
			label: nested.string({ nullable: false }),
			metadata: nested.object({
				fields: (child) => ({
					scores: child.int({ list: true, nullable: false }),
				}),
				nullable: false,
			}),
			note: nested.string(),
		}),
		nullable: false,
		typeName: 'Summary',
	})

	expectTypeOf(summary).toExtend<GenericOutputDescriptor>()
	type SummaryValue = OutputValue<typeof summary>
	interface ExpectedSummary {
		readonly label: string
		readonly metadata: {
			readonly scores: readonly number[]
		}
		readonly note: string | null
	}
	const actualSummary = undefined as unknown as SummaryValue
	const expectedSummary: ExpectedSummary = actualSummary
	const roundTrippedSummary: SummaryValue = expectedSummary
	expectTypeOf(expectedSummary).toEqualTypeOf<ExpectedSummary>()
	expectTypeOf(roundTrippedSummary).toEqualTypeOf<SummaryValue>()
	expectTypeOf<SummaryValue['metadata']['scores']>().toEqualTypeOf<
		readonly number[]
	>()
})

test('exposes every built-in output representation option', () => {
	const output = undefined as unknown as OutputBuilder

	output.bigint({ nullable: false })
	output.binary({ list: true })
	output.boolean({ description: 'Flag' })
	output.date()
	output.dateTime({ timezone: false })
	output.decimal({ precision: 12, scale: 2 })
	output.enum({ values: ['draft'] })
	output.enum({ values: defineEnum('OutputStatus', ['draft']) })
	output.float()
	output.int()
	output.json()
	output.object({ fields: () => ({}), typeName: 'EmptyOutput' })
	output.string()
	output.time({ timezone: true })
	output.uuid()
})

test('rejects persisted, input, relationship, and plugin-owned options', () => {
	const output = undefined as unknown as OutputBuilder

	// @ts-expect-error -- Output values never provide create defaults.
	output.string({ default: 'hidden' })
	// @ts-expect-error -- Output nullability replaces required input presence.
	output.string({ required: true })
	// @ts-expect-error -- Output values are never immutable stored fields.
	output.string({ immutable: true })
	// @ts-expect-error -- Output values cannot be indexed.
	output.string({ indexed: true })
	// @ts-expect-error -- Output integers cannot own sequences.
	output.int({ autoIncrement: true })
	// @ts-expect-error -- Output temporal values are not generated.
	output.dateTime({ autoNow: true })
	// @ts-expect-error -- Plugin input validation is not output validation.
	output.string({ validation: { validate: () => ({ value: 'x' }) } })
	type HasPointer = 'pointer' extends keyof OutputBuilder ? true : false
	type HasRelation = 'relation' extends keyof OutputBuilder ? true : false
	expectTypeOf<HasPointer>().toEqualTypeOf<false>()
	expectTypeOf<HasRelation>().toEqualTypeOf<false>()
})
