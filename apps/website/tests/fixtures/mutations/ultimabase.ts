import { UltimaBase } from '@ultimabase/core'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

import './generated-types.ts'
import { Account, Comment, Post } from './schemas.ts'

export const ultimabase = new UltimaBase({
	plugins: [softDeletePlugin({ defaultMode: 'disabled' })],
	schemas: [Account, Comment, Post],
	validation: {
		nestedWrites: { maxDepth: 5, maxOperations: 100 },
	},
})
