import { declareD } from './lib.ts'
export const UserD = declareD({ className: 'User', fields: (f) => ({ email: f.string(), name: f.string(), todo: f.pointer({ target: () => TodoD }) }) })
export const TodoD = declareD({ className: 'Todo', fields: (f) => ({ title: f.string(), done: f.boolean(), owner: f.pointer({ target: () => UserD }) }) }).with({
	read: ({ where }) => where.is('owner', (user) => user.eq('email', 'x')),
})
