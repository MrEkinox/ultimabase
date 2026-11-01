// The user model: the model that uses `members` is the application's users,
// as the auth plugin's `defineUser` makes it.
//#region members
import type { PluginOf, PluginTypes, UseOf } from 'ultimabase'
import { definePlugin } from 'ultimabase'

export interface Members extends PluginTypes {
	readonly name: 'members'
}

const definition = definePlugin<Members>({
	name: 'members',
	// A `viewer` filter on a relation to that model is the signed-in user.
	userModel: true,
})

export const members: UseOf<Members> = definition.use
export const membersPlugin: PluginOf<Members> = definition.plugin
//#endregion
