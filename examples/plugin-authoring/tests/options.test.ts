import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import { expect, it } from 'vitest'
import { z } from 'zod'

it('parses plugin options once with a Standard Schema validator', () => {
	//#region schema-parser
	const parseOptions = definePluginOptionsParser({
		name: 'workflow plugin options',
		schema: z.strictObject({
			instanceId: z.string().optional(),
			mode: z.enum(['review', 'publish']).default('review'),
		}),
	})
	//#endregion schema-parser

	const options = parseOptions({})
	expect(options).toStrictEqual({ mode: 'review' })
	expect(Object.isFrozen(options)).toBe(true)
	// A strict object rejects unknown keys, in TypeScript and at Runtime.
	// @ts-expect-error -- `mod` is a typo of `mode`.
	expect(() => parseOptions({ mod: 'publish' })).toThrow()
})

it('parses plugin options with the manual contract', () => {
	//#region manual-parser
	const parseOptions = definePluginOptionsParser({
		name: 'workflow plugin options',
		keys: ['instanceId', 'mode'] as const,
		normalize: ({ instanceId, mode }) => ({
			instanceId: typeof instanceId === 'string' ? instanceId : undefined,
			mode: mode === 'publish' ? 'publish' : 'review',
		}),
	})
	//#endregion manual-parser

	expect(parseOptions({ mode: 'publish' })).toStrictEqual({
		instanceId: undefined,
		mode: 'publish',
	})
	expect(() => parseOptions({ verbose: true })).toThrow('verbose')
})
