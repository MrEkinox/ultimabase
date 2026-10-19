import { declareA } from './lib.ts'
export const UserA = declareA({ className: 'User', fields: (f) => ({ email: f.string(), name: f.string(), todo: f.pointer({ target: () => TodoA }) }) })
export const TodoA = declareA({ className: 'Todo', fields: (f) => ({ title: f.string(), done: f.boolean(), owner: f.pointer({ target: () => UserA }) }) }).with({
	read: ({ where }) => where.is('owner', (user) => user.eq('email', 'x')),
})
