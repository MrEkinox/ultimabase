// The functions a client calls to read the trash and to restore a post:
// the soft delete plugin's commands, which no transport exposes alone.
import { allow, defineFunction } from 'ultimabase'
import { z } from 'zod'
import { Post } from './models.ts'

//#region functions
export const trash = defineFunction({
	name: 'trash',
	query: true,
	output: [Post],
	run: ({ caller }) => Post.trash.findMany({}, { as: caller }),
}).with({ access: allow.public })

export const restorePost = defineFunction({
	name: 'restorePost',
	input: z.object({ id: z.string() }),
	output: Post,
	run: ({ caller, input }) =>
		Post.restore({ where: { id: input.id } }, { as: caller }),
}).with({ access: allow.public })
//#endregion
