import { it } from 'vitest'
import { assertUserAuthLanguageService } from '../user-auth-language-service.js'

// Package consumers must retain the same inference after declaration bundling.
it('publishes typed Password User methods and their editor documentation', () => {
	assertUserAuthLanguageService('built')
})
