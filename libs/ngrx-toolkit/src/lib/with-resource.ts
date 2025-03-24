import {
  EmptyFeatureResult,
  SignalStoreFeature,
  StateSignals,
} from '@ngrx/signals';
import { SignalStoreFeatureResult } from '@ngrx/signals/src/signal-store-models';
import {
  Resource,
  ResourceRef,
  ResourceStatus,
  Signal,
  untracked,
} from '@angular/core';

type StoreForResource<Input extends SignalStoreFeatureResult> = StateSignals<
  Input['state']
> &
  Input['props'] &
  Input['methods'];

type ResourceFeature<T> = EmptyFeatureResult & {
  props: {
    value: Signal<T>;
    status: Signal<ResourceStatus>;
    error: Signal<unknown>;
    isLoading: Signal<boolean>;
    __resource: {
      [RESOURCE]: ResourceRef<T>;
    };
  };
  methods: {
    hasValue(): this is Resource<NonNullable<T>>;
    reload(): boolean;
  };
};

type NamedResourceFeature<
  Name extends string,
  ResourceValue
> = EmptyFeatureResult & {
  props: {
    [Key in Name]: ResourceRef<ResourceValue>;
  } & {
    __resources: {
      [RESOURCE]: Record<string, ResourceRef<ResourceValue>>;
    };
  };
};

/**
 *
 * Adds a resource which is directly integrated into
 * the SignalStore, making the instance fully type-compatible
 * with a ResourceRef, i.e. a readonly resource.
 * You can also call it the "SignalStore as resource"-pattern.
 *
 * That makes the SignalStore quite versatile, because it can be used
 * for all the upcoming APIs in Angular that require a resource and at
 * the same it is a fully-fledged SignalStore with all its features.
 *
 * The `value` property will be a be of type `DeepSignal` and a computed.
 *
 * There is an option to integrate multiple resources. The approach would
 * be the same we have with `withEntites` via named properties. I suggest
 * that we avoid that in the beginning and only support it, if the
 * community comes up with good reasons.
 *
 * To the outside, it is always a readonly resource. I would not provide
 * a configuration like `{ protectedResource: false }`.
 *
 * The actual resource is hidden behind a private Symbol. That means it is
 * not accessible even for the features of the SignalStore.
 * Instead, we provide standalone functions for methods of a writable Resource.
 * That is
 * - reloadResource(store)
 * - patchState(store, setResource(value))
 *
 * Although resource is not part of the state, patchState should support it.
 *
 * And for `withHttpResource, following functions can be applied additionally:
 * - destroyHttpResource(store)
 *
 * In a sense, it is not experimental, since the experimental resources
 * are coming outside from Angular itself. We just provide the API.
 *
 * TODO: own resource type with more options (Marko's RFC)
 * TODO: named resources
 * TODO: Throw error on name collision
 *
 * If a resource httpResource or resource already exists, we get a type error.
 */
export function withResource<Input extends SignalStoreFeatureResult, Value>(
  resourceFactory: (store: StoreForResource<Input>) => ResourceRef<Value>
): SignalStoreFeature<Input, ResourceFeature<Value>>;

/**
 * The named resource version creates resources at a property of the resourceName.
 *
 * The functions `reloadResource` and `setResourceValue` also accept a name.
 *
 * Putting it as a property is to be able to provide multipe `ResourceRef`
 * types. Splitting up the various properties of `ResourceRef` with a named
 * prefix would not allow that.
 *
 * Example:
 * ```ts
 * const Store = signalStore(
 *   withState({
 *     selectedId: undefined as number | undefined,
 *   }),
 *   withResource('list', store => withHttpResource<Product[]>(() => `/product`)),
 *   withResource('detail', store => withHttpResource<ProductDetail>(() => `/product/${store.id()}`)),
 * )
 *
 * const store = inject(Store);
 *
 * const listResource: ResourceRef<Product[]> = store.list;
 * const detailResource: ResourceRef<ProductDetail[]> = store.detail;
 *
 * ```
 * @param name name of the property where the resource is stored
 * @param resourceFactory function generating the actual resource
 */
export function withResource<
  Input extends SignalStoreFeatureResult,
  ResourceValue,
  Name extends string
>(
  name: Name, // name should be seen first.
  resourceFactory: (
    store: StoreForResource<Input>
  ) => ResourceRef<ResourceValue>
): SignalStoreFeature<Input, NamedResourceFeature<Name, ResourceValue>>;

/**
 * Implementation Note
 *
 * We want to hide the resource from both inside (other SignalStore features)
 * and the outside (component, services, etc.)
 *
 * Since we can't change the type of the SignalStore, that it automatically
 * hides a RESOURCE symbol (like STATE_SOURCE), we hide the resource in the
 * state behind __resource which encapsulates it for the consumer.
 * Additionally, we put the actual resource into the property __resource
 * into a RESOURCE symbol, so that it is also encapsulated for the features
 * of the SignalStore.
 */
export function withResource<
  Input extends SignalStoreFeatureResult,
  ResourceValue,
  Name extends string
>(
  nameOrResourceFactory:
    | string
    | ((store: StoreForResource<Input>) => ResourceRef<ResourceValue>),
  resourceFactory?: (
    store: StoreForResource<Input>
  ) => ResourceRef<ResourceValue>
): SignalStoreFeature<
  Input,
  NamedResourceFeature<Name, ResourceValue> | ResourceFeature<ResourceValue>
> {
  if (typeof nameOrResourceFactory === 'string') {
    throw new Error('');
  }

  return createResourceFeature(nameOrResourceFactory);
}

function createResourceFeature<
  Input extends SignalStoreFeatureResult,
  ResourceValue
>(
  resourceFactory: (
    store: StoreForResource<Input>
  ) => ResourceRef<ResourceValue>
): SignalStoreFeature<Input, ResourceFeature<ResourceValue>> {
  return (store) => {
    const storeForResourceFactory = {
      ...store['stateSignals'],
      ...store['props'],
      ...store['methods'],
    };

    const resource = resourceFactory(storeForResourceFactory);

    return {
      ...store,
      props: {
        ...store.props,
        value: resource.value,
        status: resource.status,
        error: resource.error,
        isLoading: resource.isLoading,
        __resource: {
          [RESOURCE]: resource,
        },
      },
      methods: {
        ...store.methods,
        hasValue: (): this is Resource<NonNullable<ResourceValue>> => {
          return resource.hasValue();
        },
        reload: (): boolean => {
          throw new Error('not implemented');
        },
      },
    };
  };
}

function createNamedResourceFeature<
  Input extends SignalStoreFeatureResult,
  ResourceValue,
  Name extends string
>(
  name: Name,
  resourceFactory: (
    store: StoreForResource<Input>
  ) => ResourceRef<ResourceValue>
): SignalStoreFeature<Input, SignalStoreFeatureResult> {
  return (store) => {
    const storeForResourceFactory = {
      ...store['stateSignals'],
      ...store['props'],
      ...store['methods'],
    };

    const resource = resourceFactory(storeForResourceFactory);
    const existingResources =
      '__resources' in store.props ? store.props['__resources'] : {};

    return {
      ...store,
      props: {
        ...store.props,
        [name]: resource.asReadonly(),
        __resources: {
          ...existingResources,
          [name]: resource,
        },
      },
    };
  };
}

const RESOURCE = Symbol('RESOURCE');

type SignalStoreResource<T> = {
  [RESOURCE]: ResourceRef<T>;
};

type ResourceState<T> = {
  __resource: SignalStoreResource<T>;
};

/**
 * sets the value of the internal resource.
 * @param value
 */
export function setResource<T>(value: T) {
  return (state: ResourceState<T>) => {
    const resource = state.__resource[RESOURCE];
    resource.set(value);
    return state;
  };
}

/**
 * Triggers the `reload` method on the internal resource.
 * @param store
 */
export function reloadResource(store: ResourceState<unknown>) {
  untracked(() => {
    store.__resource[RESOURCE].reload();
  });
}
