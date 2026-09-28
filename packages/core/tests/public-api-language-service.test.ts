import { describe, expect, it } from 'vitest'

import { createPublicApiLanguageServiceFixture } from '../../../tooling/vitest/typescript-language-service.js'

const removedNames = [
	'ActiveFrameworkContext',
	'CapabilityInventory',
	'CapabilityInventoryEntry',
	'CapabilityProviderInspection',
	'CapabilityRequirementInspection',
	'getCurrentFrameworkContext',
] as const

const fixture = createPublicApiLanguageServiceFixture({
	directory: import.meta.dirname,
	moduleSpecifier: '../src/index.js',
	removedNames,
})

describe('@ultimabase/core source public API', () => {
	it('keeps repository-only assembly types out of root autocomplete', () => {
		const exports = fixture.readExportCompletions()

		for (const name of removedNames) {
			expect(exports).not.toContain(name)
		}
	})

	it('rejects imports of repository-only assembly types', () => {
		const messages = fixture.readRemovedMessages()

		expect(messages).toHaveLength(removedNames.length)
		for (const name of removedNames) {
			expect(messages.some((message) => message.includes(name))).toBe(true)
		}
	})
})
