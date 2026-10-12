import { it } from 'vitest'

import { assertUserAuthLanguageService } from '../user-auth-language-service.js'

// Package consumers keep the same inference after declaration bundling.
it('publishes typed User members and their editor documentation', () => {
	assertUserAuthLanguageService('built')
})
