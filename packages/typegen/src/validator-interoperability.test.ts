import { FrameworkApplication, Schema } from '@ultimabase/core'
import { validationPlugin } from '@ultimabase/validation-plugin'
import * as v from 'valibot'
import { expect, it } from 'vitest'
import { z } from 'zod'

import { generateApplicationTypes } from './generator.js'

it('omits opaque validators from declarations and deterministic fingerprints', () => {
	const ZodSchema = Schema.define({
		className: 'ValidatorNeutralTypegen',
		fields: (field) => ({
			tags: field.string({
				list: true,
				required: true,
				validation: z.array(z.string().min(1)),
			} as never),
		}),
	})
	const ValibotSchema = Schema.define({
		className: 'ValidatorNeutralTypegen',
		fields: (field) => ({
			tags: field.string({
				list: true,
				required: true,
				validation: v.array(v.pipe(v.string(), v.minLength(1))),
			} as never),
		}),
	})
	const zod = generateApplicationTypes({
		application: new FrameworkApplication({
			plugins: [validationPlugin()],
			schemas: [ZodSchema],
		}),
		applicationId: 'validator-neutral',
	})
	const valibot = generateApplicationTypes({
		application: new FrameworkApplication({
			plugins: [validationPlugin()],
			schemas: [ValibotSchema],
		}),
		applicationId: 'validator-neutral',
	})

	expect(valibot.fingerprint).toBe(zod.fingerprint)
	expect(valibot.contents).toBe(zod.contents)
	expect(valibot.snapshot).toStrictEqual(zod.snapshot)
	expect(zod.contents).toContain('readonly tags: ReadonlyArray<string>')
	expect(zod.contents).toContain('readonly validation?:')
	for (const artifact of [zod.contents, JSON.stringify(zod.snapshot)]) {
		expect(artifact).not.toContain('zod')
		expect(artifact).not.toContain('valibot')
	}
})
