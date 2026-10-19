import { declareC } from './lib.ts'
export const UserC = declareC({ className: 'User', fields: (f) => ({ email: f.string(), name: f.string(), todo: f.pointer({ target: () => TodoC }) }) })
export const TodoC = declareC({ className: 'Todo', fields: (f) => ({ title: f.string(), done: f.boolean(), owner: f.pointer({ target: () => UserC }) }) }).with({
	read: ({ where }) => where.is('owner', (user) => user.eq('email', 'x')),
})
