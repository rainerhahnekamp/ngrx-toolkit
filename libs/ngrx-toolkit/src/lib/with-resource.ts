import { SignalStoreFeature, StateSignals } from '@ngrx/signals';
import { SignalStoreFeatureResult } from '@ngrx/signals/src/signal-store-models';

type StoreForResource<Input extends SignalStoreFeatureResult> = StateSignals<
  Input['state']
> &
  Input['props'] &
  Input['methods'];

/**
 *
 * Adds a resource which is directly integrated into
 * the SignalStore, making the instance fully type-compatible
 * with a ResourceRef, i.e. a readonly resource.
 * You can also call the "SignalStore as resource"-pattern.
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
 * If a resource httpResource or resource already exists, we get a type error.
 */
export function withResource<
  Input extends SignalStoreFeatureResult,
  Output extends SignalStoreFeatureResult
>(
  resourceFactory: (
    store: StoreForResource<Input>
  ) => SignalStoreFeature<Input, Output>
): SignalStoreFeature<Input, Output> {
  return (store) => {
    const storeForFactory = {
      ...store['stateSignals'],
      ...store['props'],
      ...store['methods'],
    } as StoreForResource<Input>;

    const feature = factoryFn(storeForFactory);

    return feature(store);
  };
}
