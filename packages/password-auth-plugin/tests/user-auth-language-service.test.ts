import { it } from 'vitest'
import { assertUserAuthLanguageService } from './user-auth-language-service.js'

// Editor assertions exercise source exports with the real generated User contract.
it('offers typed Password User methods, profile fields, and hover documentation', () => {
	assertUserAuthLanguageService('source')
})
