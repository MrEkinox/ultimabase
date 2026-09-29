import type { StandardSchemaV1 } from '@standard-schema/spec'
import { expectTypeOf, test } from 'vitest'

import { UltimaBase } from '@ultimabase/core'

import { validationPlugin } from '../src/plugin.js'

declare const stringSchema: StandardSchemaV1<string>
declare const numberSchema: StandardSchemaV1<number>
declare const stringListSchema: StandardSchemaV1<readonly string[]>

const ValidationApplication = UltimaBase.use(validationPlugin())

test('validates exact source field contracts without generated declarations', () => {
	const Post = ValidationApplication.Schema.define({
		className: 'SourceValidationPost',
		fields: (field) => ({
			count: field.int({ required: true, validation: numberSchema }),
			tags: field.string({ list: true, validation: stringListSchema }),
			title: field.string({ required: true, validation: stringSchema }),
			// @ts-expect-error -- a number validator cannot validate a string field.
			wrong: field.string({ validation: numberSchema }),
		}),
	})

	expectTypeOf(Post.className).toEqualTypeOf<'SourceValidationPost'>()
})

test('keeps Validation absent from an unconfigured source factory', () => {
	UltimaBase.Schema.define({
		className: 'SourceWithoutValidation',
		fields: (field) => ({
			// @ts-expect-error -- Validation is installed only on its configured factory.
			title: field.string({ validation: stringSchema }),
		}),
	})
})
