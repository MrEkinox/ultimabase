import { expectTypeOf, test } from 'vitest'

import type { RequestContextValueType } from '@ultimabase/core'
import type { PasswordPrincipal } from '@ultimabase/password-auth-plugin'

import type { articleACL } from './fixtures/security/acl.js'
import type { editor } from './fixtures/security/roles.js'
import type { Member } from './fixtures/security/schemas.js'
import type { tenantId } from './fixtures/security/request-identity.js'

test('preserves typed security subjects and immutable ACL values', () => {
	expectTypeOf<
		RequestContextValueType<typeof tenantId>
	>().toEqualTypeOf<string>()
	expectTypeOf<PasswordPrincipal<typeof Member>['user']>().toEqualTypeOf<
		ReturnType<typeof Member.pointer>
	>()
	expectTypeOf<typeof editor.kind>().toEqualTypeOf<'role'>()
	expectTypeOf<ReturnType<typeof articleACL.grantPublic>>().toEqualTypeOf<
		typeof articleACL
	>()
})
