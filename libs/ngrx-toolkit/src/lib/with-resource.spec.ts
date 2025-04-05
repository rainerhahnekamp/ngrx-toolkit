import {
  patchState,
  signalStore,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import {
  reloadResource,
  setNamedResource,
  setResource,
  withResource,
} from './with-resource';

import { httpResource, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { inject, Injectable, resource, ResourceStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';

type Address = {
  id: number;
  street: string;
  streetNumber: string;
  city: {
    zip: string;
    district: string;
    name: string;
  };
  country: string;
};

const venice: Address = {
  id: 1,
  street: 'Main Street',
  streetNumber: '1A',
  city: {
    zip: '710D',
    district: 'San Juliano',
    name: 'Venice',
  },
  country: 'Italy',
};

type User = {
  id: number;
  name: string;
};

@Injectable({ providedIn: 'root' })
export class AddressResolver {
  lookup(_input: string) {
    return Promise.resolve(venice);
  }
}
const StoreWithDefaultValue = signalStore(
  { providedIn: 'root' },
  withState({ input: '', user: 'hi' }),
  withProps(() => ({
    _addressResolver: inject(AddressResolver),
  })),
  withResource((store) =>
    resource({
      request: () => store.input() || undefined,
      loader: () => store._addressResolver.lookup(store.input()),
    })
  ),

  withMethods((store) => ({
    setInput: (input: string) => patchState(store, { input }),
    setAddress(address: Address) {
      patchState(store, setResource(address));
    },
    reloadResource: () => {
      reloadResource(store);
    },
  }))
);

const StoreWithoutDefaultValue = signalStore(
  { providedIn: 'root' },
  withState({ input: '', user: 'hi' }),
  withProps(() => ({
    _addressResolver: inject(AddressResolver),
  })),
  withResource((store) =>
    resource({
      request: () => store.input() || undefined,
      loader: () => store._addressResolver.lookup(store.input()),
    })
  ),

  withMethods((store) => ({
    setInput: (input: string) => patchState(store, { input }),
    setAddress(address: Address) {
      patchState(store, setResource(address));
    },
    reloadResource: () => {
      reloadResource(store);
    },
  }))
);

describe('withResource', () => {
  function setup<T>(Store: new () => T) {
    const resolver = TestBed.inject(AddressResolver);
    const lookupSpy = jest.spyOn(resolver, 'lookup');

    return { store: TestBed.inject(Store), lookupSpy };
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await jest.runAllTimersAsync();
    jest.useRealTimers();
  });

  it('should match the type of readonly resource', () => {
    const Store = signalStore(
      { providedIn: 'root' },
      withResource(() =>
        resource({
          loader: () => Promise.resolve(venice),
        })
      )
    );
    const _addressResource = TestBed.runInInjectionContext(() =>
      resource({
        request: undefined,
        loader: () => Promise.resolve(venice),
      }).asReadonly()
    );
    const store = TestBed.inject(Store);

    type AddressResource = typeof _addressResource;
    const _store = store satisfies AddressResource;
  });

  it('should match the type of readonly resource with default value', () => {
    const Store = signalStore(
      { providedIn: 'root' },
      withResource(() =>
        resource({
          defaultValue: venice,
          loader: () => Promise.resolve(venice),
        })
      )
    );
    const _addressResource = TestBed.runInInjectionContext(() =>
      resource({
        request: undefined,
        defaultValue: venice,
        loader: () => Promise.resolve(venice),
      }).asReadonly()
    );
    const store = TestBed.inject(Store);

    type AddressResource = typeof _addressResource;
    const _store = store satisfies AddressResource;
  });

  for (const { name, Store } of [
    { name: 'StoreWithDefaultValue', Store: StoreWithDefaultValue },
    { name: 'StoreWithoutDefaultValue', Store: StoreWithoutDefaultValue },
  ]) {
    describe(name, () => {
      it('should initially not load the data', async () => {
        const { store } = setup(Store);

        expect(store.hasValue()).toBe(false);
        await jest.runAllTimersAsync();
        expect(store.hasValue()).toBe(false);
      });

      it('should load the data on valid input', async () => {
        const { store } = setup(Store);

        store.setInput('Domgasse 5');
        await jest.runAllTimersAsync();
        expect(store.hasValue()).toBe(true);
        expect(store.value()).toBe(venice);
      });

      it('should update the resource value', async () => {
        const { store } = setup(Store);

        store.setInput('Domgasse 5');
        await jest.runAllTimersAsync();
        expect(store.hasValue()).toBe(true);

        store.setAddress({ ...venice, street: 'Domgasse 6' });
        expect(store.value()).toEqual({ ...venice, street: 'Domgasse 6' });
      });

      it('should go to error mode', async () => {
        const { store, lookupSpy } = setup(Store);
        lookupSpy.mockRejectedValueOnce('offline');

        store.setInput('Domgasse 5');
        await jest.runAllTimersAsync();
        expect(store.hasValue()).toBe(false);
        expect(store.error()).toBe('offline');
        expect(store.value()).toBe(undefined);
      });

      it('should throw if reload is called from the outside', () => {
        const { store } = setup(Store);
        expect(() => store.reload()).toThrow('not implemented');
      });

      it('should reload on request change', async () => {
        const newVenice = { ...venice };
        const { store, lookupSpy } = setup(Store);
        lookupSpy.mockImplementation((input) =>
          Promise.resolve(input === 'Domgasse 5' ? venice : newVenice)
        );

        store.setInput('Domgasse 5');
        await jest.runAllTimersAsync();
        expect(store.value()).toBe(venice);

        store.setInput('Domgasse 6');
        await jest.runAllTimersAsync();
        expect(store.value()).toBe(newVenice);
      });

      it('should reload on reload call', async () => {
        const { store, lookupSpy } = setup(Store);
        lookupSpy.mockResolvedValue(venice);

        store.setInput('Domgasse 5');
        await jest.runAllTimersAsync();
        expect(store.value()).toBe(venice);

        store.reloadResource();
        await jest.runAllTimersAsync();
        expect(store.value()).toBe(venice);
        expect(lookupSpy).toHaveBeenCalledTimes(2);
      });

      it('should rerun after error', async () => {
        const { store, lookupSpy } = setup(Store);
        lookupSpy.mockRejectedValueOnce('offline');

        store.setInput('Domgasse 5');
        await jest.runAllTimersAsync();
        expect(store.hasValue()).toBe(false);

        lookupSpy.mockResolvedValueOnce(venice);
        store.reloadResource();
        await jest.runAllTimersAsync();
        expect(store.hasValue()).toBe(true);
        expect(store.value()).toBe(venice);
      });
    });
  }

  it('should also work with httpResource', async () => {
    const Store = signalStore(
      { providedIn: 'root' },
      withResource(() => {
        return httpResource(() => `/api/geo`);
      })
    );

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    const store = TestBed.inject(Store);
    const ctrl = TestBed.inject(HttpTestingController);
    await jest.runAllTimersAsync();
    ctrl.expectOne('/api/geo').flush(venice);
    await jest.runAllTimersAsync();

    expect(store.value()).toBe(venice);
  });

  describe('named resource', () => {
    it('should work with named resources', async () => {
      const Store = signalStore(
        { providedIn: 'root' },
        withState({ userId: 0 }),
        withMethods((store) => ({
          setUserId(userId: number) {
            patchState(store, { userId });
          },
        })),
        withResource('users', () => {
          return httpResource<User[]>(() => `/api/users`, { defaultValue: [] });
        }),
        withResource('activeUser', (store) => {
          return httpResource<User>(() => {
            const userId = store.userId();
            if (userId === 0) {
              return undefined;
            }
            return `/api/users/${userId}`;
          });
        })
      );

      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const store = TestBed.inject(Store);
      const ctrl = TestBed.inject(HttpTestingController);
      await jest.runAllTimersAsync();

      ctrl.expectOne('/api/users').flush([
        { id: 1, name: 'Konrad' },
        { id: 2, name: 'Hans' },
      ]);
      await jest.runAllTimersAsync();

      const users = store.users.value();
      expect(store.users.hasValue()).toBe(true);
      expect(store.users.value()).toBe(users);
      expect(store.activeUser.status()).toBe(ResourceStatus.Idle);
      expect(store.activeUser.value()).toBeUndefined();

      store.setUserId(2);

      await jest.runAllTimersAsync();
      expect(store.activeUser.status()).toBe(ResourceStatus.Loading);
      expect(store.activeUser.value()).toBeUndefined();

      ctrl.expectOne('/api/users/2').flush({ id: 2, name: 'Hans' });
      await jest.runAllTimersAsync();

      expect(store.activeUser.status()).toBe(ResourceStatus.Resolved);
      expect(store.activeUser.value()).toEqual({ id: 2, name: 'Hans' });
      expect(store.users.value()).toBe(users);
    });

    it('should not throw on reload on named resource', async () => {
      const Store = signalStore(
        { providedIn: 'root' },
        withState({ userId: 0 }),
        withResource('users', () => {
          return resource({ loader: () => Promise.resolve([]) });
        })
      );

      type StoreType = InstanceType<typeof Store>;
      const store: StoreType = TestBed.inject(Store);

      expect(() => store.users.reload()).not.toThrow('not implemented');
    });

    it('throws if resource already exists', () => {
      const Store = signalStore(
        { providedIn: 'root' },
        withResource(() => resource({ loader: () => Promise.resolve([]) })),
        withResource(() => resource({ loader: () => Promise.resolve([]) }))
      );

      expect(() => TestBed.inject(Store)).toThrow(
        'You can only have one unnamed resource in a SignalStore. Use withResource(name, factory) to create named resources.'
      );
    });

    it('throws same named resource already exists', () => {
      const Store = signalStore(
        { providedIn: 'root' },
        withResource('user', () =>
          resource({ loader: () => Promise.resolve([]) })
        ),
        withResource('user', () =>
          resource({ loader: () => Promise.resolve([]) })
        )
      );

      expect(() => TestBed.inject(Store)).toThrow(
        'Resource with "name" user already exists. Please choose a different name.'
      );
    });

    it('can combine both named and unnamed resource', async () => {
      const Store = signalStore(
        { providedIn: 'root' },
        withState({ userId: 0 }),
        withMethods((store) => ({
          setUserId(userId: number) {
            patchState(store, { userId });
          },
        })),
        withResource(() => {
          return httpResource<User[]>(() => `/api/users`, { defaultValue: [] });
        }),
        withResource('activeUser', (store) => {
          return httpResource<User>(() => {
            const userId = store.userId();
            if (userId === 0) {
              return undefined;
            }
            return `/api/users/${userId}`;
          });
        })
      );

      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const store = TestBed.inject(Store);
      const ctrl = TestBed.inject(HttpTestingController);
      await jest.runAllTimersAsync();

      ctrl.expectOne('/api/users').flush([
        { id: 1, name: 'Konrad' },
        { id: 2, name: 'Hans' },
      ]);
      await jest.runAllTimersAsync();

      const users = store.value();
      expect(store.hasValue()).toBe(true);
      expect(store.value()).toBe(users);
      expect(store.activeUser.status()).toBe(ResourceStatus.Idle);
      expect(store.activeUser.value()).toBeUndefined();

      store.setUserId(2);

      await jest.runAllTimersAsync();
      expect(store.activeUser.status()).toBe(ResourceStatus.Loading);
      expect(store.activeUser.value()).toBeUndefined();

      ctrl.expectOne('/api/users/2').flush({ id: 2, name: 'Hans' });
      await jest.runAllTimersAsync();

      expect(store.activeUser.status()).toBe(ResourceStatus.Resolved);
      expect(store.activeUser.value()).toEqual({ id: 2, name: 'Hans' });
      expect(store.value()).toBe(users);
    });

    describe('reload and setting', () => {
      const StoreWithSingleNamedResource = signalStore(
        { providedIn: 'root' },
        withState({ userId: 0 }),
        withMethods((store) => ({
          setUserId(userId: number) {
            patchState(store, { userId });
          },
        })),
        withResource('activeUser', (store) => {
          return httpResource<User>(() => {
            const userId = store.userId();
            if (userId === 0) {
              return undefined;
            }
            return `/api/users/${userId}`;
          });
        }),
        withMethods((store) => ({
          reloadActiveUser() {
            reloadResource('activeUser', store);
          },
          setActiveUser(user: User) {
            patchState(store, setNamedResource('activeUser', user));
          },
        }))
      );

      const StoreWithMultipleNamedResources = signalStore(
        { providedIn: 'root' },
        withState({ userId: 0 }),
        withMethods((store) => ({
          setUserId(userId: number) {
            patchState(store, { userId });
          },
        })),
        withResource('activeUser', (store) => {
          return httpResource<User>(() => {
            const userId = store.userId();
            if (userId === 0) {
              return undefined;
            }
            return `/api/users/${userId}`;
          });
        }),
        withResource('foo', () => {
          return resource({
            loader: () => Promise.resolve(venice),
          });
        }),
        withMethods((store) => ({
          reloadActiveUser() {
            reloadResource('activeUser', store);
          },
          setActiveUser(user: User) {
            patchState(store, setNamedResource('activeUser', user));
          },
        }))
      );
      for (const [name, Store] of [
        ['single named resource', StoreWithSingleNamedResource],
        ['multiple named resources', StoreWithMultipleNamedResources],
      ] as const) {
        it(`should allow to reload and set the value for ${name}`, async () => {
          TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
          });
          const store = TestBed.inject(Store);
          const ctrl = TestBed.inject(HttpTestingController);
          await jest.runAllTimersAsync();

          store.setUserId(2);
          await jest.runAllTimersAsync();

          ctrl.expectOne('/api/users/2').flush({ id: 2, name: 'Hans' });
          await jest.runAllTimersAsync();

          expect(store.activeUser.status()).toBe(ResourceStatus.Resolved);
          expect(store.activeUser.value()).toEqual({ id: 2, name: 'Hans' });

          store.reloadActiveUser();
          await jest.runAllTimersAsync();
          ctrl.expectOne('/api/users/2');
        });

        it(`should allow to reload and set the value for ${name}`, async () => {
          TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
          });
          const store = TestBed.inject(Store);
          store.setActiveUser({ id: 2, name: 'Hans' });
        });
      }
    });
  });
});
