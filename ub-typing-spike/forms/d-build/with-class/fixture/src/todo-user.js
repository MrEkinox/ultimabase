import { App } from './app.ts';
import { Todo } from './todo.ts';
export const TodoUser = App.PasswordUserSchema.define({
    className: 'TodoUser',
    fields: (field) => ({
        displayName: field.string({ required: true }),
        assignedTodos: field.relation({ target: () => Todo, mappedBy: 'assignee' }),
    }),
}).with({
    access: {
        // Cross-schema filter User -> Todo; Todo filters on TodoUser in the other direction.
        read: { where: ({ where }) => where.some('assignedTodos', (todo) => todo.eq('archived', false)) },
        update: { where: ({ where, userId }) => where.eq('id', userId) },
    },
    hooks: {
        fields: { displayName: { resolveInput: ({ value }) => value.trim() } },
    },
    postgres: { table: 'users' },
});
