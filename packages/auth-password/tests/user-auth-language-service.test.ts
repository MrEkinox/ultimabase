import { it } from 'vitest'

import { assertUserAuthLanguageService } from './user-auth-language-service.js'

// Editor assertions exercise the password method's source exports.
it('offers typed User members, method fields, and hover documentation', () => {
	assertUserAuthLanguageService('source')
})
