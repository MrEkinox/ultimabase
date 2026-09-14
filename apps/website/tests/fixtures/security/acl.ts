import { ACL } from '@ultimabase/acl-permissions-plugin'

import { AppRole, Member } from './schemas.js'

const alice = Member.pointer('0199b38e-ef80-7000-8000-000000000001')

export const articleACL = new ACL()
	.grantPublic('read')
	.grantPrincipal(alice, 'read', 'update')
	.grantRole(AppRole.role('editor'), 'read', 'update')

export const withoutPublicRead = articleACL.revokePublic('read')
