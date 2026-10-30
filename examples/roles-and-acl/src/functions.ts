// The functions: a note's writer lets a role read the note, and a user
// lists their roles.
import { isAuthenticated } from '@ultimabase/auth'
import { rolesOf } from '@ultimabase/roles'
import { PublicError, defineFunction, master } from 'ultimabase'
import { z } from 'zod'
import { Role } from './models.ts'
import { Note } from './notes.ts'

//#region share
export const shareNote = defineFunction({
	name: 'shareNote',
	input: z.object({ note: z.string(), role: z.string() }),
	output: Note,
	run: async ({ caller, input }) => {
		// Read as the caller: a note it cannot read does not exist for it.
		const note = await Note.findUnique(
			{ where: { id: input.note } },
			{ as: caller },
		)
		if (note === null) throw new PublicError('NOT_FOUND', 'No such note.')
		if (!note.acl.allows(caller, 'write')) {
			throw new PublicError(
				'ACCESS_DENIED',
				'Only a writer of the note shares it.',
			)
		}
		const where = { name: input.role }
		const role = await Role.findUnique({ where }, { as: master })
		if (role === null) throw new PublicError('NOT_FOUND', 'No such role.')
		// Only Master writes an ACL, once the function has checked the caller.
		const data = { acl: note.acl.allowRole(role, 'read') }
		return Note.update({ where: { id: note.id }, data }, { as: master })
	},
}).with({ access: isAuthenticated })
//#endregion

//#region my-roles
// The caller's roles, inherited ones included, read once per request.
export const myRoles = defineFunction({
	name: 'myRoles',
	output: z.array(z.string()),
	run: ({ caller }) => rolesOf(caller).map(({ name }) => name),
}).with({ access: isAuthenticated })
//#endregion
