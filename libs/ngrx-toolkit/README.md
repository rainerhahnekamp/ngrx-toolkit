# NgRx Toolkit

<p align="center">
<img src="https://raw.githubusercontent.com/angular-architects/ngrx-toolkit/main/logo.png" width="320" style="text-align: center">
</p>

NgRx Toolkit is an extension to the NgRx Signals Store. **It is still in beta** but already offers following features:

- Devtools: Integration into Redux Devtools
- Redux: Possibility to use the Redux Pattern (Reducer, Actions, Effects)

To install it, run

```shell
npm i @angular-architects/ngrx-toolkit
```

## Devtools: `withDevtools()`

`withDevtools` synchronizes a store to the Redux Devtools.

```typescript
export const FlightStore = signalStore(
  { providedIn: 'root' },
  withDevtools('flights'), // <-- add this
  withState({ flights: [] as Flight[] }),
  // ...
);
```

Each store acts as a "feature state". In the example above, `FlightStore` is synchronized to the root store's `flights` property.

---

Every `patchState` triggers a new synchronization. Since the Signal Store doesn't support the concept of actions, the name is always "Store Update".

`tkPatchState` calls internally `patchState` but allows you to setup pass an action name as well.

```typescript

```

---

If both global (@ngrx/store) and Signal Store are running, the Signal Store is available in the Redux Devtools under the tab "NgRx Signal Store".

---

When a store gets destroyed, it is also removed from DevTools.

---

If the same store exists multiple times, for example multiple components provide it, the name is automatically indexed:

```typescript
import { withDevtools } from './with-devtools';
import { Component } from '@angular/core';
import { FlightStore } from './flight-store';

const FlightStore = signalStore(withDevtools('flights'))

@Component({
  template: ``,
  standalone: true,
  providers: [FlightStore]
})
export class FlightSearch {
}

@Component({
  template: ``,
  standalone: true,
  providers: [FlightStore]
})
export class FlightAdmin {
}
```

Only if, both components are shown at the same time, the first instantiated component would have its store name as "flights", the second "flights-1".

Because that might be confusing, a component or service can rename the store upon instantiation. That is also the recommendation:

```typescript
import { withDevtools } from './with-devtools';
import { Component } from '@angular/core';
import { FlightStore } from './flight-store';

const FlightStore = signalStore(withDevtools('flights'));

@Component({
  template: ``,
  standalone: true,
  providers: [FlightStore]
})
export class FlightSearch {
  constructor(flightStore: FlightStore) {
    flightStore.renameDevtoolsName('[FlightSearch] flights')
  }
}

@Component({
  template: ``,
  standalone: true,
  providers: [FlightStore]
})
export class FlightAdmin {
  constructor(flightStore: FlightStore) {
    flightStore.renameDevtoolsName('[FlightAdmin] flights')
  }
}
```

It is possible to disable the automatic indexing via `withDevtools('flights', {indexNames: false})`. In that case a second simultaneous instance would already throw:

```typescript
import { withDevtools } from './with-devtools';
import { Component } from '@angular/core';
import { FlightStore } from './flight-store';

const FlightStore = signalStore(withDevtools('flights'))

@Component({
  template: ``,
  standalone: true,
  providers: [FlightStore]
})
export class FlightSearch {
}

// will throw if these components are shown at the same time
@Component({
  template: ``,
  standalone: true,
  providers: [FlightStore]
})
export class FlightAdmin {
}
```

If two different signalStores with the same name exist, `withDevtools` throws a runtime error immediately. That is before the store is even instantiated:

```typescript
import { withDevtools } from './with-devtools';
import { signalStore } from '@ngrx/signals';

const LufthansaStore = signalStore(withDevtools('flights'));
const BritishAirwaysStore = signalStore(withDevtools('flights')) // will throw
```

---

If `FlightStore` is instantiated three times, the DevTools would show the following feature states: `flights`, `flights-1`, `flights-2`.

`withDevtools` adds the method `renameDevtools` which would rename the feature state. Renaming is only possible during the instantiation, i.e. constructor. If the name already exists, the store throws a runtime error.

## Redux: `withRedux()`

`withRedux()` bring back the Redux pattern into the Signal Store.

It can be combined with any other extension of the Signal Store.

Example:

```typescript
export const FlightStore = signalStore(
  { providedIn: 'root' },
  withState({ flights: [] as Flight[] }),
  withRedux({
    actions: {
      public: {
        load: payload<{ from: string; to: string }>(),
      },
      private: {
        loaded: payload<{ flights: Flight[] }>(),
      },
    },
    reducer(actions, on) {
      on(actions.loaded, ({ flights }, state) => {
        patchState(state, 'flights loaded', { flights });
      });
    },
    effects(actions, create) {
      const httpClient = inject(HttpClient);
      return {
        load$: create(actions.load).pipe(
          switchMap(({ from, to }) =>
            httpClient.get<Flight[]>(
              'https://demo.angulararchitects.io/api/flight',
              {
                params: new HttpParams().set('from', from).set('to', to),
              },
            ),
          ),
          tap((flights) => actions.loaded({ flights })),
        ),
      };
    },
  }),
);
```

## DataService `withDataService()`

`withDataService()` allows to connect a Data Service to the store:

This gives you a store for a CRUD use case:

```typescript
export const SimpleFlightBookingStore = signalStore(
  { providedIn: 'root' },
  withCallState(),
  withEntities<Flight>(),
  withDataService({
    dataServiceType: FlightService,
    filter: { from: 'Paris', to: 'New York' },
  }),
  withUndoRedo(),
);
```

The features ``withCallState`` and ``withUndoRedo`` are optional, but when present, they enrich each other.

The Data Service needs to implement the ``DataService`` interface:

```typescript 
@Injectable({
  providedIn: 'root'
})
export class FlightService implements DataService<Flight, FlightFilter> {
  loadById(id: EntityId): Promise<Flight> { ...
  }

  load(filter: FlightFilter): Promise<Flight[]> { ...
  }

  create(entity: Flight): Promise<Flight> { ...
  }

  update(entity: Flight): Promise<Flight> { ...
  }

  delete(entity: Flight): Promise<void> { ...
  }

  [
...]
}
```

Once the store is defined, it gives its consumers numerous signals and methods they just need to delegate to:

```typescript
@Component(...)
export class FlightSearchSimpleComponent {
  private store = inject(SimpleFlightBookingStore);

  from = this.store.filter.from;
  to = this.store.filter.to;
  flights = this.store.entities;
  selected = this.store.selectedEntities;
  selectedIds = this.store.selectedIds;

  loading = this.store.loading;

  canUndo = this.store.canUndo;
  canRedo = this.store.canRedo;

  async search() {
    this.store.load();
  }

  undo(): void {
    this.store.undo();
  }

  redo(): void {
    this.store.redo();
  }

  updateCriteria(from: string, to: string): void {
    this.store.updateFilter({ from, to });
  }

  updateBasket(id: number, selected: boolean): void {
    this.store.updateSelected(id, selected);
  }

}
```

## DataService with Dynamic Properties

To avoid naming conflicts, the properties set up by ``withDataService`` and the connected features can be configured in a typesafe way:

```typescript
export const FlightBookingStore = signalStore(
  { providedIn: 'root' },
  withCallState({
    collection: 'flight'
  }),
  withEntities({
    entity: type<Flight>(),
    collection: 'flight'
  }),
  withDataService({
    dataServiceType: FlightService,
    filter: { from: 'Graz', to: 'Hamburg' },
    collection: 'flight'
  }),
  withUndoRedo({
    collections: ['flight'],
  }),
);
```

This setup makes them use ``flight`` as part of the used property names. As these implementations respect the Type Script type system, the compiler will make sure these properties are used in a typesafe way:

```typescript
@Component(...)
export class FlightSearchDynamicComponent {
  private store = inject(FlightBookingStore);

  from = this.store.flightFilter.from;
  to = this.store.flightFilter.to;
  flights = this.store.flightEntities;
  selected = this.store.selectedFlightEntities;
  selectedIds = this.store.selectedFlightIds;

  loading = this.store.flightLoading;

  canUndo = this.store.canUndo;
  canRedo = this.store.canRedo;

  async search() {
    this.store.loadFlightEntities();
  }

  undo(): void {
    this.store.undo();
  }

  redo(): void {
    this.store.redo();
  }

  updateCriteria(from: string, to: string): void {
    this.store.updateFlightFilter({ from, to });
  }

  updateBasket(id: number, selected: boolean): void {
    this.store.updateSelectedFlightEntities(id, selected);
  }

}
```
