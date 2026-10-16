import { UltimaBase } from '@ultimabase/core'
import { test } from 'vitest'

import { softDeletePlugin } from './index.js'

const App = UltimaBase.use(softDeletePlugin())

test('sees feature fields in the indexes of define (ADR-0303, ADR-0339)', () => {
	App.Schema.define({
		className: 'TypedSoftDeletedSlug',
		fields: (field) => ({ slug: field.string({ required: true }) }),
		indexes: [{ fields: ['slug'], unique: true, where: { isDeleted: false } }],
		softDelete: true,
	})
	App.Schema.define({
		className: 'TypedActiveSlug',
		fields: (field) => ({ slug: field.string({ required: true }) }),
		// @ts-expect-error -- without `softDelete` there is no `isDeleted`.
		indexes: [{ fields: ['slug'], unique: true, where: { isDeleted: false } }],
	})
})
