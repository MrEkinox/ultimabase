import { ACL } from '@ultimabase/core/plugins';
import { App } from './app.ts';
import { TodoPriority } from './enums.ts';
import { Tag } from './tag.ts';
import { TodoUser } from './todo-user.ts';
export const Todo = App.Schema.define({
    className: 'Todo',
    softDelete: true,
    fields: (field) => ({
        title: field.string({ required: true, validate: (value) => value.trim() !== '' || 'Title is empty' }),
        archived: field.boolean({ required: true, default: false }),
        priority: field.enum({ enum: TodoPriority, default: 'normal' }),
        allowedPriorities: field.enumList({ enum: TodoPriority }),
        status: field.enum({ values: ['open', 'doing', 'done'], required: true, default: 'open' }),
        assignee: field.pointer({ target: () => TodoUser, onDelete: 'setNull' }),
        parent: field.pointer({ target: () => Todo }),
        subtasks: field.relation({ target: () => Todo, mappedBy: 'parent' }),
        tags: field.relation({ target: () => Tag }),
    }),
    access: {
        read() {
            return this.where.eq('archived', false);
        },
        update() {
            return this.where.is('assignee', (user) => user.eq('id', this.userId));
        },
        delete() {
            return { assignee: { is: { email: { endsWith: '@admin.test' } } } };
        },
    },
    acl: {
        default() {
            return ACL.none().grantRole('TodoRole', 'read', 'update');
        },
    },
    hooks: {
        beforeUpdate() {
            if (this.item.isDeleted)
                throw new TypeError('Deleted todos are read-only');
        },
    },
    postgres: { table: 'todos', indexes: [{ fields: ['archived', 'priority'] }] },
});
