//#region operation
import { PublicError } from '@ultimabase/core'
import { defineOperation } from '@ultimabase/plugin-kit'
import { z } from 'zod'

/**
 * An application operation without a plugin. GraphQL exposes it as the
 * `readingTime` mutation, typed from the `input` and `output` validators.
 */
export const readingTime = defineOperation({
	name: 'readingTime',
	input: z.object({
		text: z.string().min(1),
		pace: z.enum(['slow', 'normal', 'fast']).default('normal'),
		options: z
			.object({ wordsPerMinute: z.number().int().positive() })
			.optional(),
	}),
	output: z.object({
		minutes: z.number().int(),
		words: z.number().int(),
	}),
	handler: ({ input }) => {
		const words = input.text.trim().split(/\s+/u).length
		if (words > 10_000) {
			// A PublicError reaches the client with its code; others are masked.
			throw new PublicError('Split the text into chapters.', {
				code: 'TEXT_TOO_LONG',
				details: { words },
			})
		}
		const pace = { slow: 100, normal: 200, fast: 300 }[input.pace]
		const perMinute = input.options?.wordsPerMinute ?? pace
		return { minutes: Math.ceil(words / perMinute), words }
	},
})
//#endregion operation
