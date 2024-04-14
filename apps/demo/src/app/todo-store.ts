import { signalStore, withHooks, withMethods } from '@ngrx/signals';
import {
  removeEntity,
  setEntity,
  updateEntity,
  withEntities,
} from '@ngrx/signals/entities';
import { tkPatchState, withDevtools } from 'ngrx-toolkit';

export interface Todo {
  id: number;
  name: string;
  finished: boolean;
  description?: string;
  deadline?: Date;
}

type AddTodo = Omit<Todo, 'id'>;

export const TodoStore = signalStore(
  withDevtools('todo'),
  withEntities<Todo>(),
  withMethods((store) => {
    let currentId = 0;
    return {
      add(todo: AddTodo) {
        tkPatchState(
          store,
          'add todo',
          setEntity({ id: ++currentId, ...todo }),
        );
      },

      remove(id: number) {
        tkPatchState(store, 'remove todo', removeEntity(id));
      },

      toggleFinished(id: number): void {
        const todo = store.entityMap()[id];
        tkPatchState(
          store,
          'toggle todo',
          updateEntity({ id, changes: { finished: !todo.finished } }),
        );
      },
    };
  }),
  withHooks({
    onInit: (store) => {
      store.add({ name: 'Go for a Walk', finished: false });
      store.add({ name: 'Sleep 8 hours once', finished: false });
      store.add({ name: 'Clean the room', finished: true });
    },
  }),
);
