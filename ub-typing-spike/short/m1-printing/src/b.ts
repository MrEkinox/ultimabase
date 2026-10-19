import { declareB } from './lib.ts'
export const UserB = declareB({ className: 'User', fields: (f) => ({ email: f.string(), name: f.string(), todo: f.pointer({ target: () => TodoB }) }) })
export const TodoB = declareB({ className: 'Todo', fields: (f) => ({ title: f.string(), done: f.boolean(), owner: f.pointer({ target: () => UserB }) }) }).with({
	read: ({ where }) => where.is('owner', (user) => user.eq('email', 'x')),
})
