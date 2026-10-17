import type { OutputBuilder, OutputValue } from '@ultimabase/core'

declare const output: OutputBuilder

output./* completion:output-builder */ string()
output.bigint({/* completion:output-bigint-options */})
output.binary({/* completion:output-binary-options */})
output.boolean({/* completion:output-boolean-options */})
output.date({/* completion:output-date-options */})
output.dateTime({/* completion:output-date-time-options */})
output.decimal({/* completion:output-decimal-options */})
// @ts-expect-error -- Completion intentionally omits the required enum domain.
output.enum({/* completion:output-enum-options */})
output.float({/* completion:output-float-options */})
output.int({/* completion:output-int-options */})
output.json({/* completion:output-json-options */})
// @ts-expect-error -- Completion intentionally omits the required object fields.
output.object({/* completion:output-object-options */})
output.string({/* completion:output-string-options */})
output.time({/* completion:output-time-options */})
output.uuid({/* completion:output-uuid-options */})

const summary = output.object({
	fields: (nested) => ({
		label: nested.string(),
		scores: nested.int({ list: true }),
	}),
})
void summary
type SummaryValue = OutputValue<typeof summary>
interface ExpectedSummary {
	readonly label: string
	readonly scores: readonly number[]
}
const actualSummary = undefined as unknown as SummaryValue
const expectedSummary: ExpectedSummary = actualSummary
const roundTrippedSummary: SummaryValue = expectedSummary
void roundTrippedSummary

// @ts-expect-error -- Output values have no persisted defaults.
output.string({ default: 'Ada' })
// @ts-expect-error -- `required: false` is the one word for a nullable output.
output.string({ nullable: true })
// @ts-expect-error -- Output values cannot own indexes.
output.string({ indexed: true })
type HasPointer = 'pointer' extends keyof OutputBuilder ? true : false
const hasPointer: HasPointer = false
void hasPointer
