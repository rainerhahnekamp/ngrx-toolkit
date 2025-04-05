import { reloadResource, withResource } from '@angular-architects/ngrx-toolkit';
import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { parseTodo, parseTodos, Todo } from './todo';

export const TodoStore = signalStore(
  { providedIn: 'root' },
  withState({
    activeId: undefined as string | undefined,
    isFormVisible: false,
    _showAll: true,
  }),
  withResource(() =>
    httpResource(() => 'http://localhost:3001/todos', {
      parse: parseTodos,
      defaultValue: [],
    })
  ),
  withResource('activeTodo', ({ activeId }) =>
    httpResource(
      () => {
        const id = activeId();
        if (id === undefined) {
          return undefined;
        }

        return `http://localhost:3001/todos/${id}`;
      },
      { parse: parseTodo }
    )
  ),
  withMethods((store) => {
    const httpClient = inject(HttpClient);

    return {
      setActiveId(id: string) {
        patchState(store, { activeId: id, isFormVisible: true });
      },
      toggleShowAll() {
        patchState(store, ({ _showAll }) => ({ _showAll: !_showAll }));
      },
      addTodo(todo: Todo) {
        httpClient.post('http://localhost:3001/todos', todo).subscribe(() => {
          reloadResource(store);
          patchState(store, { isFormVisible: false });
        });
      },
      updateTodo(todo: Todo) {
        httpClient
          .put(`http://localhost:3001/todos/${todo.id}`, todo)
          .subscribe(() => {
            reloadResource(store);
            patchState(store, { isFormVisible: false });
          });
      },
      closeForm() {
        patchState(store, { isFormVisible: false });
      },
    };
  }),
  withMethods((store) => ({
    toggleFinished(todo: Todo) {
      const todos = store.value();
      if (!todos) {
        return;
      }

      store.updateTodo({ ...todo, finished: !todo.finished });
    },
    showForm() {
      patchState(store, { isFormVisible: true });
    },
  })),
  withComputed((state) => ({
    todos: computed(() => {
      const showAll = state._showAll();
      return state.value().filter((todo) => {
        if (showAll) {
          return true;
        }
        return !todo.finished;
      });
    }),
  }))
);
