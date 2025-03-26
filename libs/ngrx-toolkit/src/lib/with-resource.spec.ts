import {
  patchState,
  signalStore,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import { reloadResource, withResource } from './with-resource';

import { inject, Injectable, resource, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { httpResource, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

type Address = {
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
  street: 'Main Street',
  streetNumber: '1A',
  city: {
    zip: '710D',
    district: 'San Juliano',
    name: 'Venice',
  },
  country: 'Italy',
};

@Injectable({ providedIn: 'root' })
export class AddressResolver {
  lookup(input: string) {
    return Promise.resolve(venice);
  }
}

describe('withResource', () => {
  const setup = () => {
    const resolver = TestBed.inject(AddressResolver);
    const lookupSpy = jest.spyOn(resolver, 'lookup');
    const Store = signalStore(
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
        reloadResource: () => {
          reloadResource(store);
        },
      }))
    );

    return { store: TestBed.inject(Store), lookupSpy };
  };

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

  it('should initially not load the data', async () => {
    const { store } = setup();

    expect(store.hasValue()).toBe(false);
    await jest.runAllTimersAsync();
    expect(store.hasValue()).toBe(false);
  });

  it('should load the data on valid input', async () => {
    const { store } = setup();

    store.setInput('Domgasse 5');
    await jest.runAllTimersAsync();
    expect(store.hasValue()).toBe(true);
    expect(store.value()).toBe(venice);
  });

  it('should go to error mode', async () => {
    const { store, lookupSpy } = setup();
    lookupSpy.mockRejectedValueOnce('offline');

    store.setInput('Domgasse 5');
    await jest.runAllTimersAsync();
    expect(store.hasValue()).toBe(false);
    expect(store.error()).toBe('offline');
    expect(store.value()).toBe(undefined);
  });

  it('should throw if reload is called from the outside', () => {
    const { store } = setup();
    expect(() => store.reload()).toThrow('not implemented');
  });

  it('should reload on request change', async () => {
    const newVenice = { ...venice };
    const { store, lookupSpy } = setup();
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
    const { store, lookupSpy } = setup();
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
    const { store, lookupSpy } = setup();
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

  it('should work with named resources', async () => {
    const Store = signalStore(
      { providedIn: 'root' },
      withResource('user', () => {
        return httpResource(() => `/api/geo`);
      }),
      withMethods((store) => ({
        foo() {
          store.__resources[RESOURCE];
        },
      }))
    );

    const store = TestBed.inject(Store);
  });

  it.todo('should not allow reload on missing resource');
  it.todo('should not allow reload on missing named resource');

  it.todo('should not compile if resource already exists');
  it.todo('should not compile if same named resource already exists');
});
