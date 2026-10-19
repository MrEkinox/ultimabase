import { UltimaBase, acl, graphql, memory, softDelete } from '../index.ts'

export const App = UltimaBase.create({
	database: memory(),
	plugins: [softDelete(), acl(), graphql()],
})
