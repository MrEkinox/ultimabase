// The function a note's writer calls to let a role read the note.
import { isAuthenticated } from '@ultimabase/auth'
import { PublicError, defineFunction, master } from 'ultimabase'
import { z } from 'zod'
import { Note, Role } from './models.ts'

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
