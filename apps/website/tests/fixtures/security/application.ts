import { aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { accessPlugin } from '@ultimabase/access-plugin'
import { MasterAuthority, UltimaBase } from '@ultimabase/core'
import { rolesPlugin } from '@ultimabase/roles-plugin'

import { AppRole, Article, Document, Member } from './schemas.ts'

export const securityApplication = new UltimaBase({
	masterAuthority: new MasterAuthority({
		keys: [{ id: 'server', value: 'server-only-development-key' }],
		onUse: () => undefined,
	}),
	plugins: [accessPlugin(), rolesPlugin(), aclPlugin()],
	schemas: [Member, AppRole, Article, Document],
})
