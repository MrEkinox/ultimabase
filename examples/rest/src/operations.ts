//#region operation
import { defineOperation } from '@ultimabase/plugin-kit'
import { z } from 'zod'

/**
 * An application operation without a plugin: REST validates the input with
 * `input`, the result with `output`, and describes both in OpenAPI.
 */
export const readingTime = defineOperation({
	name: 'readingTime',
	input: z.object({
		text: z.string().min(1),
		wordsPerMinute: z.number().int().positive().default(200),
	}),
	output: z.object({ minutes: z.number().int().positive() }),
	handler: ({ input }) => {
		const words = input.text.trim().split(/\s+/u).length
		return { minutes: Math.ceil(words / input.wordsPerMinute) }
	},
})
//#endregion operation
