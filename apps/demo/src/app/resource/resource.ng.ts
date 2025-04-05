import { SelectionModel } from '@angular/cdk/collections';
import { JsonPipe } from '@angular/common';
import { Component, effect, inject } from '@angular/core';
import {
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Todo } from './todo';
import { TodoStore } from './todo-store.ng';

@Component({
  template: `
    <p>
      This example shows how to use <span class="code">withResource</span>. The
      <span class="code">todoStore</span> defines two resources: one unnamed,
      meaning the SignalStore itself is a resource, and another named
      <span class="code">activeUser</span>, which is accessible via a property.
    </p>
    <p>
      Both resources are readonly externally. Internally, the SignalStore can
      update a resource using <span class="code">setResource</span> (via
      <span class="code">patchState</span>) and trigger a reload via
      <span class="code">reloadResource</span>. Both functions support named
      resources.
    </p>
    <h2>Todo List with Resource</h2>
    <p>
      Here, you see a list of todos. You can mark them as finished or edit them.
      If you makr one as finished, it will be reloaded
    </p>
    <p>
      Once you edit a todo, you can also set the description. After editing, the
      todos are reloaded.
    </p>
    <p>You can also show all todos or hide the finished ones.</p>

    @if (todoStore.isLoading()) {
    <p>Loading...</p>
    } @else if (todoStore.error()) {
    <p>Error: {{ todoStore.error() | json }}</p>
    } @else if (todoStore.hasValue()) {
    <div style="margin-bottom: 1em">
      <button mat-raised-button style="margin-right: 2em" (click)="addTodo()">
        Add
      </button>
      <mat-checkbox (change)="todoStore.toggleShowAll()"
        >Hide Finished</mat-checkbox
      >
    </div>
    <mat-table [dataSource]="dataSource" class="mat-elevation-z8">
      <!-- Checkbox Column -->
      <ng-container matColumnDef="finished">
        <mat-header-cell *matHeaderCellDef></mat-header-cell>
        <mat-cell *matCellDef="let row" class="actions">
          <mat-checkbox
            (click)="$event.stopPropagation()"
            (change)="toggleFinished(row)"
            [checked]="row.finished"
          >
          </mat-checkbox>
          <mat-icon (click)="setActive(row)">edit</mat-icon>
        </mat-cell>
      </ng-container>

      <!-- Name Column -->
      <ng-container matColumnDef="name">
        <mat-header-cell *matHeaderCellDef>Name</mat-header-cell>
        <mat-cell *matCellDef="let element">{{ element.name }}</mat-cell>
      </ng-container>

      <!-- Deadline Column -->
      <ng-container matColumnDef="deadline">
        <mat-header-cell mat-header-cell *matHeaderCellDef
          >Deadline
        </mat-header-cell>
        <mat-cell mat-cell *matCellDef="let element"
          >{{ element.deadline }}
        </mat-cell>
      </ng-container>

      <mat-header-row *matHeaderRowDef="displayedColumns"></mat-header-row>
      <mat-row
        *matRowDef="let row; columns: displayedColumns"
        (click)="selection.toggle(row)"
      ></mat-row>
    </mat-table>
    } @if (todoStore.isFormVisible()) {
    <div class="details">
      <form [formGroup]="todoForm" (ngSubmit)="onSubmit()">
        <input type="hidden" formControlName="id" />
        <div class="form-group">
          <label for="name">Name:</label>
          <input id="name" formControlName="name" class="form-control" />
        </div>
        <div class="form-group">
          <label for="description">Description:</label>
          <textarea
            id="description"
            formControlName="description"
            class="form-control"
          ></textarea>
        </div>
        <div class="form-group">
          <label for="deadline">Deadline:</label>
          <input
            id="deadline"
            type="date"
            formControlName="deadline"
            class="form-control"
          />
        </div>
        <div class="form-group">
          <mat-checkbox formControlName="finished">Finished</mat-checkbox>
        </div>
        <button type="submit" mat-raised-button color="primary">Save</button>
        <button type="button" mat-raised-button (click)="cancel()">
          Cancel
        </button>
      </form>
    </div>
    }
  `,
  styles: `.actions {
      display: flex;
      align-items: center;
    }
  
    .details {
      margin: 20px;
      display: flex;
      flex-direction: column;
      gap: 15px;
      max-width: 300px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .form-control {
      padding: 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 14px;
    }

    .btn {
      padding: 10px 15px;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    .btn:hover {
      background-color: #0056b3;
    }

    .code {
      background-color: #f4f4f4;
      padding: 2px 4px;
      border-radius: 3px;
      font-family: monospace;
    }
    `,
  imports: [
    MatCheckboxModule,
    MatIconModule,
    MatTableModule,
    MatButton,
    FormsModule,
    ReactiveFormsModule,
    JsonPipe,
  ],
})
export default class ResourceComponent {
  todoStore = inject(TodoStore);

  displayedColumns: string[] = ['finished', 'name', 'deadline'];
  dataSource = new MatTableDataSource<Todo>([]);
  selection = new SelectionModel<Todo>(true, []);

  todoForm = inject(NonNullableFormBuilder).group({
    id: [''],
    name: [''],
    description: [''],
    deadline: [''],
    finished: [false],
  });

  constructor() {
    effect(
      () => {
        this.dataSource.data = this.todoStore.todos();
      },
      { debugName: 'todos' }
    );

    effect(
      () => {
        const activeTodo = this.todoStore.activeTodo.value();
        if (activeTodo) {
          this.todoForm.setValue(activeTodo);
        }
      },
      { debugName: 'todoDetail' }
    );
  }

  setActive(todo: Todo) {
    this.todoStore.setActiveId(todo.id);
  }

  addTodo() {
    this.todoStore.showForm();
    this.todoForm.setValue({
      id: '',
      name: '',
      description: '',
      deadline: '',
      finished: false,
    });
  }

  onSubmit() {
    if (this.todoForm.valid) {
      const entity = this.todoForm.getRawValue();
      if (entity.id) {
        this.todoStore.updateTodo(entity);
      } else {
        this.todoStore.addTodo(entity);
      }
    }
  }

  cancel() {
    this.todoStore.closeForm();
  }

  toggleFinished(todo: Todo) {
    this.todoStore.toggleFinished(todo);
  }
}
