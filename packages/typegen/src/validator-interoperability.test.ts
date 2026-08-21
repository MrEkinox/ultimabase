import { FrameworkApplication, Schema } from '@ultimabase/core'
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
			}),
		}),
	})
	const ValibotSchema = Schema.define({
		className: 'ValidatorNeutralTypegen',
		fields: (field) => ({
			tags: field.string({
				list: true,
				required: true,
				validation: v.array(v.pipe(v.string(), v.minLength(1))),
			}),
		}),
	})
	const zod = generateApplicationTypes({
		application: new FrameworkApplication({
			plugins: [],
			schemas: [ZodSchema],
		}),
		applicationId: 'validator-neutral',
	})
	const valibot = generateApplicationTypes({
		application: new FrameworkApplication({
			plugins: [],
			schemas: [ValibotSchema],
		}),
		applicationId: 'validator-neutral',
	})

	expect(valibot.fingerprint).toBe(zod.fingerprint)
	expect(valibot.contents).toBe(zod.contents)
	expect(valibot.snapshot).toStrictEqual(zod.snapshot)
	expect(zod.contents).toContain('readonly tags: ReadonlyArray<string>')
	for (const artifact of [zod.contents, JSON.stringify(zod.snapshot)]) {
		expect(artifact).not.toContain('validation')
		expect(artifact).not.toContain('zod')
		expect(artifact).not.toContain('valibot')
	}
})
