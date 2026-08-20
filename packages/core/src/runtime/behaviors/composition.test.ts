import { createApplication } from '../../foundation.js'
import { Schema } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { composeRuntimeBehaviors } from './composition.js'

describe('generic Runtime behavior composition', () => {
	it('allocates no behavior bundle when no plugin provides one', async () => {
		const Post = Schema.define({
			className: 'NoRuntimeBehaviorPost',
			fields: (field) => ({ title: field.string() }),
		})
		const application = await createApplication({
			plugins: [],
			schemas: [Post],
		})

		expect(composeRuntimeBehaviors(application)).toBeUndefined()
		await application.dispose()
	})
})
