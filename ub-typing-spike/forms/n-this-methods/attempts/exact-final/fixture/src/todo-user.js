import { App } from './app.ts';
import { Todo } from './todo.ts';
export const TodoUser = App.PasswordUserSchema.define({
    className: 'TodoUser',
    fields: (field) => ({
        displayName: field.string({
            required: true,
            resolveInput() {
                return this.value.trim();
            },
        }),
        assignedTodos: field.relation({ target: () => Todo, mappedBy: 'assignee' }),
    }),
    access: {
        // Cross-schema filter User -> Todo; Todo filters on TodoUser in the other direction.
        read() {
            return this.where.some('assignedTodos', (todo) => todo.eq('archived', false));
        },
        update() {
            return this.where.eq('id', this.userId);
        },
    },
    postgres: { table: 'users' },
});
