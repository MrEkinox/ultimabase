import { expectTypeOf, test } from 'vitest'
import { defineEnum } from '../fields/builtins/shared-enum.js'

import type {
	GenericOutputDescriptor,
	OutputBuilder,
	OutputValue,
} from '../../index.js'

test('infers exact scalar nullability and list containers', () => {
	const output = undefined as unknown as OutputBuilder
	// ADR-0340: outputs are non-null unless they declare `nullable: true`.
	const optionalName = output.string({ nullable: true })
	const name = output.string()
	const explicitName = output.string()
	const optionalTags = output.string({ list: true, nullable: true })
	const tags = output.string({ list: true })
	const status = output.enum({ values: ['draft', 'published'] as const })
	const optionalStatus = output.enum({
		nullable: true,
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
	expectTypeOf<OutputValue<typeof explicitName>>().toEqualTypeOf<string>()
	expectTypeOf<OutputValue<typeof optionalTags>>().toEqualTypeOf<
		readonly string[] | null
	>()
	expectTypeOf<OutputValue<typeof tags>>().toEqualTypeOf<readonly string[]>()
	expectTypeOf<OutputValue<typeof status>>().toEqualTypeOf<
		'draft' | 'published'
	>()
	expectTypeOf<OutputValue<typeof optionalStatus>>().toEqualTypeOf<
		'draft' | 'published' | null
	>()
})

test('infers recursive objects with required nullable properties', () => {
	const output = undefined as unknown as OutputBuilder
	const summary = output.object({
		fields: (nested) => ({
			label: nested.string(),
			metadata: nested.object({
				fields: (child) => ({
					scores: child.int({ list: true }),
				}),
			}),
			note: nested.string({ nullable: true }),
		}),
		typeName: 'Summary',
	})
	const optionalSummary = output.object({
		fields: (nested) => ({ label: nested.string() }),
		nullable: true,
	})

	expectTypeOf(summary).toExtend<GenericOutputDescriptor>()
	expectTypeOf<OutputValue<typeof optionalSummary>>().toEqualTypeOf<{
		readonly label: string
	} | null>()
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

	output.bigint({ nullable: true })
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
