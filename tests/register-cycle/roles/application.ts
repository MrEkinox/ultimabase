import { UltimaBase } from '@ultimabase/core'
import { rolesPlugin } from '@ultimabase/roles-plugin'

// The create-app case found in migration step 6.3: an unfinished member
// schema beside a finished role schema factory.
export const App = UltimaBase.use(rolesPlugin())

export const Member = App.Schema.define({
	className: 'Member',
	fields: (field) => ({ name: field.string() }),
})

export const AppRole = App.RoleSchema.define({
	className: 'AppRole',
	members: () => Member,
	fields: (field) => ({ description: field.string() }),
}).with((plugins) => plugins.roles({ deletion: 'fail' }))

export const ultimabase = new App({ schemas: [Member, AppRole] })

declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
