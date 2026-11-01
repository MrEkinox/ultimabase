// The users, whom an API key names as its owner.
//#region member
import { defineModel } from 'ultimabase'
import { members } from './plugins/members.ts'

export const Member = defineModel({
	name: 'Member',
	use: [members()],
	fields: (f) => ({ name: f.string() }),
})
//#endregion
