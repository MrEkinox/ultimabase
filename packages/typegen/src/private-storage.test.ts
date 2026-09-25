import {
	plugin,
	contributeDeclarations,
	definePrivateCollection,
	FrameworkApplication,
	stringField,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { generateApplicationTypes } from './generator.js'

const createPrivatePlugin = (fieldName: 'digest' | 'verifier') => {
	const collection = definePrivateCollection({
		contributionId: 'credentials',
		fields: {
			[fieldName]: stringField({ required: true }),
		},
		indexes: [{ fields: [fieldName] }],
	})
	return plugin({
		core: '^0.0.0',
		id: 'fixture.typegen-private',
		permissions: { 'storage:private': 'Declares private verifier storage.' },
		version: '1.0.0',
		contributions: [
			contributeDeclarations({
				privateStorage: ({ privateStorage }) => {
					privateStorage.register(collection)
					return undefined
				},
			}),
		],
	})
}

describe('private storage Typegen boundary', () => {
	it('changes the application fingerprint without emitting private declarations', () => {
		const digest = generateApplicationTypes({
			application: new FrameworkApplication({
				plugins: [createPrivatePlugin('digest')],
				schemas: [],
			}),
			applicationId: 'private-app',
		})
		const verifier = generateApplicationTypes({
			application: new FrameworkApplication({
				plugins: [createPrivatePlugin('verifier')],
				schemas: [],
			}),
			applicationId: 'private-app',
		})

		expect(digest.fingerprint).not.toBe(verifier.fingerprint)
		expect(digest.snapshot.privateStorageFingerprint).toMatch(/^[a-f0-9]{64}$/u)
		expect(digest.contents).not.toContain('credentials')
		expect(digest.contents).not.toContain('digest')
		expect(digest.snapshot.schemas).toStrictEqual([])
	})

	it('retains no private fingerprint for an application with no consumer', () => {
		const generated = generateApplicationTypes({
			application: new FrameworkApplication({ plugins: [], schemas: [] }),
			applicationId: 'public-only',
		})

		expect(generated.snapshot.privateStorageFingerprint).toBeUndefined()
	})
})
