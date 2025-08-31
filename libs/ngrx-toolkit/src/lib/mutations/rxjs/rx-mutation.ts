import {
  assertInInjectionContext,
  computed,
  DestroyRef,
  inject,
  Injector,
  signal,
  Signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  concatMap,
  defer,
  EMPTY,
  Observable,
  OperatorFunction,
  Subject,
  tap,
} from 'rxjs';

/**
 * Changes to the RFC
 *
 * 1. `rxMutation` doesn't return an object with execute. Instead it union of a function
 * (for execution) and a an object literal providing different metadata
 *
 * 2. Changes in the way how the status is dervied. If the executor returns a falsy
 * value, then the status should be still fulfilled and not idle.
 *
 * 3. Better error handling
 *
 * 4. Each mutation call returns a Promise of the status
 *
 * 5. defer() to catch error in the executor
 *
 * 6. The former value of the mutation stays if the mutation fails. This is different to a
 * resource which would also throw a value.
 * 
 * 7. Renaming of Types:
 * - MutationStatus -> MutationResult
 * - RxOperation -> MutationState
 * - RxOperator -> FlatteningOperator
 * - OperationStatus -> MutationStatus

 */

export type FlatteningOperator = <T, R>(
  fn: (value: T) => Observable<R>,
) => OperatorFunction<T, R>;

export type MutationState<T> = {
  readonly value: Signal<T>;
  readonly error: Signal<unknown>;
  readonly isPending: Signal<boolean>;
  readonly isFulfilled: Signal<boolean>;
  readonly status: Signal<MutationStatus>;
  hasValue(): this is MutationState<Exclude<T, undefined>>;
};

type MutationStateUtils<T> = MutationState<T | undefined> & {
  setFulFilled(value?: T): void;
  setError(error: unknown): void;
  incrementExecutionCount(): void;
  decrementExecutionCount(): void;
};

/**
 * There could be the possibility that the executor's Observable emits
 * multiple values. Since all flattening operator wait for the Observable
 * to complete, and we consider the last value one to be the final one,
 * `MutationResult` will contain the last value.
 */
export type MutationResult<Value> =
  | {
      status: 'fulfilled';
      value: Value;
    }
  | {
      status: 'error';
      error: unknown;
    }
  | {
      status: 'cancelled';
    };

// State is not set but derived via contextual signals,
// That is the combination of
// - value(),
// - error(),
// - executionCount()
// - activated()
// That is a design decision in order to avoid checking whenever an execution happens
export function mutationStateUtils<T>(): MutationStateUtils<T> {
  const value = signal<T | undefined>(undefined);
  const error = signal<unknown>(undefined);
  const executionCount = signal(0);
  const activated = signal(false);

  const isPending = computed(() => executionCount() > 0);
  const isFulfilled = computed(() => !isPending() && !error() && activated());
  const status = computed<MutationStatus>(() => {
    if (isPending()) {
      return 'pending';
    }
    if (error() !== undefined) {
      return 'error';
    }

    return isFulfilled() ? 'fulfilled' : 'idle';
  });

  return {
    value,
    error,
    isPending,
    isFulfilled,
    status,
    hasValue(): this is MutationState<Exclude<T, undefined>> {
      return value() !== undefined;
    },
    setFulFilled(val) {
      value.set(val);
    },
    setError(err) {
      error.set(err);
    },
    incrementExecutionCount(): void {
      activated.set(true);
      executionCount.update((count) => count + 1);
    },
    decrementExecutionCount(): void {
      executionCount.update((count) => Math.max(0, count - 1));
    },
  };
}

export type MutationStatus = 'idle' | 'pending' | 'fulfilled' | 'error';

export type RxMutation<Input, Value> = ((
  input: Input,
) => Promise<MutationResult<Value>>) &
  MutationState<Value | undefined>;

export type MutationExecutor<Input, Value> = (
  input: Input,
) => Observable<Value>;
export type MutationConfig<Input, Value> = {
  executor: MutationExecutor<Input, Value>;
  operator?: FlatteningOperator;
  onSuccess?: (config: {
    input: NoInfer<Input>;
    value: NoInfer<Value>;
  }) => void;
  onError?: (config: { input: NoInfer<Input>; error: unknown }) => void;
  injector?: Injector;
};

/**
 *
 * @param executor
 */
export function rxMutation<Input, Value>(
  executor: MutationExecutor<Input, Value>,
): RxMutation<Input, Value>;
export function rxMutation<Input, Value>(
  config: MutationConfig<Input, Value>,
): RxMutation<Input, Value>;
export function rxMutation<Input, Value>(
  configOrExecutor:
    | MutationConfig<Input, Value>
    | MutationExecutor<Input, Value>,
): RxMutation<Input, Value> {
  const config: MutationConfig<Input, Value> =
    typeof configOrExecutor === 'function'
      ? { executor: configOrExecutor }
      : configOrExecutor;

  if (!config.injector) {
    assertInInjectionContext(rxMutation);
  }

  const {
    setFulFilled,
    setError,
    incrementExecutionCount,
    decrementExecutionCount,
    ...mutationState
  } = mutationStateUtils<Value>();

  const injector = config.injector ?? inject(Injector);
  const destroyRef = injector.get(DestroyRef);

  // Observable getting the value for the mutation
  const input$ = new Subject<{
    input: Input;
    resolve: (value: MutationResult<Value>) => void;
  }>();
  const operator: FlatteningOperator = config.operator ?? concatMap;

  input$
    .pipe(
      operator(({ input, resolve }) => {
        incrementExecutionCount();
        let isPending = true;
        setError(undefined);

        return defer(() => config.executor(input)).pipe(
          tap({
            next: (value) => {
              isPending = false;
              setFulFilled(value);
              config.onSuccess?.({ input, value });
            },
            error: (error) => {
              isPending = false;
              setError(error);
              config.onError?.({ input, error });
            },
            finalize: () => {
              decrementExecutionCount();

              if (isPending) {
                setFulFilled();
                resolve({ status: 'cancelled' });
              } else if (mutationState.error()) {
                resolve({ status: 'error', error: mutationState.error() });
              } else {
                resolve({
                  status: 'fulfilled',
                  value: mutationState.value() as Value,
                });
              }
            },
          }),
          catchError(() => EMPTY),
        );
      }),
      takeUntilDestroyed(destroyRef),
    )
    .subscribe();

  function execute(input: Input) {
    return new Promise<MutationResult<Value>>((resolve) => {
      input$.next({ input, resolve });
    });
  }

  execute.value = mutationState.value;
  execute.error = mutationState.error;
  execute.isPending = mutationState.isPending;
  execute.isFulfilled = mutationState.isFulfilled;
  execute.status = mutationState.status;
  execute.hasValue = mutationState.hasValue;

  return execute;
}
