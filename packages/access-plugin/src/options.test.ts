import { Schema, stringField, UltimaBase } from '@ultimabase/core'
import { describe, expect, it, onTestFinished } from 'vitest'

import { accessPlugin } from './index.js'

describe('compiled Access field options', () => {
	it('preserves ordinary metadata when no field policy is declared', () => {
		const options = { required: true } as const
		const Document = Schema.define({
			className: 'AccessOptionsPlainDocument',
			fields: (field) => ({ title: field.string(options) }),
		})
		const application = new UltimaBase({
			plugins: [accessPlugin()],
			schemas: [Document],
		})
		onTestFinished(() => application.dispose())
		application.compile()

		const title = Document.fields.title
		if (title === undefined)
			throw new Error('Expected the compiled title field')
		expect(title.options).toMatchObject({ required: true })
		expect(title.options).not.toHaveProperty('access')
		expect(options).toEqual({ required: true })
	})

	it('normalizes policy through its installed owner while retaining field metadata', () => {
		const access = { read: true }
		const Document = Schema.define({
			className: 'AccessOptionsSecuredDocument',
			fields: (field) => ({
				title: field.string({ access, required: true }),
			}),
		})
		const application = new UltimaBase({
			plugins: [accessPlugin()],
			schemas: [Document],
		})
		onTestFinished(() => application.dispose())
		application.compile()

		// The live compiler snapshots policy options against later caller changes.
		access.read = false
		const title = Document.fields.title
		if (title === undefined)
			throw new Error('Expected the compiled title field')
		expect(title.options).toMatchObject({
			access: { read: true },
			required: true,
		})
		expect(
			'access' in title.options && Object.isFrozen(title.options.access),
		).toBe(true)
		expect(Document.provenance.fieldOptions.title?.access).toMatchObject({
			definition: { owner: { pluginId: '@ultimabase/access-plugin' } },
			value: { owner: { kind: 'application' } },
		})
	})

	it('rejects malformed options through the public field factory', () => {
		expect(() => stringField(null as never)).toThrow(
			'field options must be an object',
		)
	})
})
