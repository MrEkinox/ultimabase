//#region factory
import { accessPlugin } from '@ultimabase/access-plugin'
import { aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { password, passwordOperations } from '@ultimabase/auth-password'
import { authOperations, authPlugin } from '@ultimabase/auth-plugin'
import { UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'

/**
 * The plugins the schemas are typed from. The HTTP server and the database
 * join in `ultimabase.ts`, where each application instance chooses its own
 * listener and connection.
 */
export const App = UltimaBase.use(
	softDeletePlugin(),
	// Opens every operation and command that a schema leaves without a rule,
	// production included; each schema narrows its own (ADR-0317).
	accessPlugin({ allowWithoutRule: { all: true } }),
	hooksPlugin(),
	validationPlugin(),
	rolesPlugin(),
	aclPlugin(),
	// The authentication routes live under `/api/auth` (ADR-0326); browsers keep
	// the session in a secure cookie instead of reading its token.
	authPlugin({
		methods: [password()],
		http: { cookie: { name: '__Host-full-stack-session', sameSite: 'lax' } },
	}),
	// Public operations are exposed by their owners (ADR-0324): REST keeps
	// the status operation; authentication is served under `/api/auth`.
	restPlugin({
		hide: [
			...Object.values(authOperations),
			...Object.values(passwordOperations),
		],
	}),
	// GraphQL exposes the authentication operations except two (ADR-0325).
	graphqlPlugin({
		hide: [passwordOperations.changePassword, authOperations.logoutEverywhere],
	}),
)
//#endregion factory
