import {
  Resource,
  ResourceRef,
  ResourceStatus,
  Signal,
  untracked,
} from '@angular/core';
import {
  EmptyFeatureResult,
  SignalStoreFeature,
  StateSignals,
  withState,
} from '@ngrx/signals';
import { SignalStoreFeatureResult } from '@ngrx/signals/src/signal-store-models';
import { throwIfNull } from './shared/throw-if-null';

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
  state: {
    [RESOURCE]: ResourceRef<T>;
  };
};

type NamedResourceFeature<
  Name extends string,
  ResourceValue
> = EmptyFeatureResult & {
  state: {
    [RESOURCES]: unknown;
  };
  props: {
    [Key in Name]: Resource<ResourceValue>;
  } & {
    __resources: {
      [RESOURCE]: Record<Name, ResourceRef<ResourceValue>>;
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
 * The goal is to have an API which is as close as possible to a potential
 * API from "@ngrx/signals". Therefore the implementation is not the most
 * efficient one. Especially the redundant storage of the resource once
 * in the state and once in the props is related to that.
 *
 * We need to have it in the state, because setResource only has access
 * to the state, whereas other parts only have access to the props.
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
  ResourceValue
>(
  nameOrResourceFactory:
    | string
    | ((store: StoreForResource<Input>) => ResourceRef<ResourceValue>),
  resourceFactory?: (
    store: StoreForResource<Input>
  ) => ResourceRef<ResourceValue>
): SignalStoreFeature {
  if (typeof nameOrResourceFactory === 'string') {
    return createNamedResourceFeature(
      nameOrResourceFactory,
      throwIfNull(resourceFactory)
    );
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
): SignalStoreFeature {
  return (store) => {
    if ('__resource' in store.props) {
      throw new Error(
        'You can only have one unnamed resource in a SignalStore. Use withResource(name, factory) to create named resources.'
      );
    }

    const storeForResourceFactory = {
      ...store['stateSignals'],
      ...store['props'],
      ...store['methods'],
    } as StoreForResource<Input>;

    const resource = resourceFactory(storeForResourceFactory);
    const storeWithState = withState({ [RESOURCE]: resource })(store);

    return {
      ...storeWithState,
      props: {
        ...storeWithState.props,
        value: resource.value,
        status: resource.status,
        error: resource.error,
        isLoading: resource.isLoading,
        __resource: {
          [RESOURCE]: resource,
        },
      },
      methods: {
        ...storeWithState.methods,
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
): SignalStoreFeature {
  return (store) => {
    const existingResources = hasNamedResources(store.props)
      ? store.props['__resources'][RESOURCE]
      : {};

    if (name in existingResources) {
      throw new Error(
        `Resource with "name" ${name} already exists. Please choose a different name.`
      );
    }

    const storeForResourceFactory = {
      ...store['stateSignals'],
      ...store['props'],
      ...store['methods'],
    } as StoreForResource<Input>;

    const resource = resourceFactory(storeForResourceFactory);
    const readonlyResource = resource.asReadonly();

    const storeWithState = withState({
      [RESOURCES]: {
        ...existingResources,
        [name]: resource,
      },
    })(store);

    return {
      ...storeWithState,
      props: {
        ...storeWithState.props,
        [name]: readonlyResource,
        __resources: {
          [RESOURCE]: {
            ...existingResources,
            [name]: resource,
          },
        },
      },
    };
  };
}

function hasNamedResources(
  props: object
): props is { __resources: { [RESOURCE]: Record<string, object> } } {
  return (
    '__resources' in props &&
    typeof props['__resources'] === 'object' &&
    Reflect.ownKeys(props['__resources'] ?? {}).includes(RESOURCE)
  );
}

const RESOURCE = Symbol('RESOURCE');
const RESOURCES = Symbol('RESOURCES');

type SignalStoreResource<T> = {
  [RESOURCE]: ResourceRef<T>;
};

type ResourceStore<T> = {
  __resource: SignalStoreResource<T>;
};

type NamedResourceStore<Name extends string, Value> = {
  __resources: { [RESOURCE]: { [Prop in Name as Name]: ResourceRef<Value> } };
};

/**
 *
 * @param store
 */
export function setResource<T>(
  value: NoInfer<T>
): (state: { [RESOURCE]: ResourceRef<T> }) => object;

export function setResource<T>(value: NoInfer<T>) {
  return (state: { [RESOURCE]: ResourceRef<T> }) => {
    state[RESOURCE].set(value);
    return {};
  };
}

export function setNamedResource<T>(name: string, value: NoInfer<T>) {
  return (state: { [RESOURCES]: unknown }) => {
    const resources = state[RESOURCES] as Record<string, ResourceRef<T>>;
    console.log(Object.keys(resources));
    resources[name].set(value);
    return {};
  };
}

/**
 * Triggers the `reload` method on the internal resource.
 * @param store
 */
export function reloadResource(store: ResourceStore<unknown>): void;
/**
 * Triggers the `reload` method on the internal resource.
 * @param store
 */
export function reloadResource<Name extends string, ResourceValue>(
  name: Name,
  store: NamedResourceStore<Name, ResourceValue>
): void;

export function reloadResource<Name extends string, ResourceValue>(
  nameOrStore: ResourceStore<ResourceValue> | string,
  store?: NamedResourceStore<Name, ResourceValue>
) {
  untracked(() => {
    if (typeof nameOrStore === 'string') {
      assertNamedRessourceStore(store, nameOrStore);
      getNamedResource(store, nameOrStore).reload();
    } else {
      assertResourceStore(nameOrStore);
      getResource(nameOrStore).reload();
    }
  });
}

function getResource<ResourceValue>(store: ResourceStore<ResourceValue>) {
  return store.__resource[RESOURCE];
}

function getNamedResource<Name extends string, ResourceValue>(
  store: NamedResourceStore<Name, ResourceValue>,
  name: Name
) {
  const resourceMap = store.__resources[RESOURCE];
  return resourceMap[name] as ResourceRef<ResourceValue>;
}

function isResourceStore<T>(store: object): store is ResourceStore<T> {
  return Boolean(
    '__resource' in store &&
      store.__resource &&
      typeof store.__resource === 'object' &&
      Reflect.ownKeys(store.__resource).includes(RESOURCE)
  );
}

function assertResourceStore<T>(
  store: object
): asserts store is ResourceStore<T> {
  if (!isResourceStore(store)) {
    throw new Error('resource is missing in SignalStore');
  }
}

function isNamedResourceStore<Name extends string, ResourceValue>(
  store: object,
  name: Name
): store is NamedResourceStore<Name, ResourceValue> {
  if (
    '__resources' in store &&
    store.__resources &&
    typeof store.__resources === 'object'
  ) {
    const resources = store.__resources as Record<
      symbol,
      ResourceRef<ResourceValue>
    >;
    return resources[RESOURCE] && name in resources[RESOURCE];
  }
  return false;
}

function assertNamedRessourceStore<Name extends string, ResourceValue>(
  store: object | undefined,
  name: Name
): asserts store is NamedResourceStore<Name, ResourceValue> {
  if (store && !isNamedResourceStore(store, name)) {
    throw new Error(`named resource ${name} is missing in SignalStore`);
  }
}
