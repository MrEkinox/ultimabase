import { accessPlugin } from '@ultimabase/access-plugin'
import { aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

export const App = UltimaBase.use(
	accessPlugin(),
	hooksPlugin(),
	softDeletePlugin(),
	aclPlugin(),
	restPlugin(),
	graphqlPlugin(),
	postgresPlugin({ url: 'postgres://localhost/spike' }),
)
