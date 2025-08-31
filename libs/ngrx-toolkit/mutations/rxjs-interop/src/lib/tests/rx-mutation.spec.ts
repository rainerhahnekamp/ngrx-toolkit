import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  exhaustMap,
  mergeMap,
  Observable,
  of,
  Subject,
  Subscriber,
  switchMap,
  throwError,
} from 'rxjs';
import {
  FlatteningOperator,
  MutationConfig,
  MutationExecutor,
  MutationResult,
  RxMutation,
  rxMutation,
} from '../rx-mutation';

function asyncTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('rxMutation', () => {
  function createRxMutation<Input, Value>(
    configOrExecutor:
      | MutationConfig<Input, Value>
      | MutationExecutor<Input, Value>,
  ): RxMutation<Input, Value> {
    return TestBed.runInInjectionContext(() => {
      if (typeof configOrExecutor === 'object') {
        return rxMutation(configOrExecutor);
      } else {
        return rxMutation(configOrExecutor);
      }
    });
  }

  function setup(
    operator: FlatteningOperator | undefined = undefined,
  ): [RxMutation<Observable<number>, number>, ...Subject<number>[]] {
    const mutate = createRxMutation({
      executor: (value$: Observable<number>) => value$,
      operator,
    });

    return [mutate, ...Array.from({ length: 5 }, () => new Subject<number>())];
  }

  function getMutationState(mutate: RxMutation<Observable<number>, number>) {
    return {
      status: mutate.status(),
      isFulfilled: mutate.isFulfilled(),
      hasValue: mutate.hasValue(),
      value: mutate.value(),
      isPending: mutate.isPending(),
      error: mutate.error(),
    };
  }

  describe('basic', () => {
    it('should create a mutation function', () => {
      const user = { id: 1 };

      const increment = createRxMutation((value: number) => {
        user.id += value;
        return of(user.id);
      });

      increment(1);
      expect(user.id).toBe(2);

      increment(2);
      expect(user.id).toBe(4);
    });

    it('allows void as parameters', () => {
      const user = { id: 1 };

      const increment = createRxMutation((_: void) => of(++user.id));
      increment();
    });

    it('should support a success and error callback', () => {
      const status = {
        success: false,
        error: false,
      };

      const mutation = createRxMutation({
        executor: (input$: Observable<unknown>) => input$,
        onSuccess: () => {
          status.success = true;
        },
        onError: () => {
          status.error = true;
        },
      });

      const input$ = new Subject<unknown>();
      mutation(input$);

      input$.next(1);
      expect(status).toEqual({ success: true, error: false });

      input$.error(new Error('Test Error'));
      expect(status).toEqual({ success: true, error: true });
    });

    it('calls onSuccess multiple times when executor observable emits multiple times', async () => {
      let successCount = 0;
      const mutate = createRxMutation({
        executor: (input$: Observable<number>) => input$,
        onSuccess: () => successCount++,
      });

      await mutate(of(1, 2, 3, 4, 5));
      expect(successCount).toBe(5);
    });
  });

  describe('MutationTracker', () => {
    describe('basic', () => {
      it('should be idle, if nothing happened', () => {
        const [mutate] = setup();
        const mutationState = getMutationState(mutate);

        expect(mutationState).toEqual({
          status: 'idle',
          isFulfilled: false,
          hasValue: false,
          value: undefined,
          isPending: false,
          error: undefined,
        });
      });

      it('should be pending, while waiting for the completion', () => {
        const [mutate, value] = setup();
        mutate(value);
        const mutationState = getMutationState(mutate);

        expect(mutationState).toEqual({
          status: 'pending',
          isFulfilled: false,
          hasValue: false,
          value: undefined,
          isPending: true,
          error: undefined,
        });
      });

      it('should be fulfilled, once observables completes', () => {
        const [mutate, value$] = setup();
        mutate(value$);
        value$.next(1);
        value$.complete();

        const mutationState = getMutationState(mutate);

        expect(mutationState).toEqual({
          status: 'fulfilled',
          isFulfilled: true,
          hasValue: true,
          value: 1,
          isPending: false,
          error: undefined,
        });
      });

      it('should error when Observable throws', () => {
        const [mutate, error] = setup();

        mutate(error);
        error.error(new Error('Test Error'));
        const mutationState = getMutationState(mutate);

        expect(mutationState).toEqual({
          status: 'error',
          isFulfilled: false,
          hasValue: false,
          value: undefined,
          isPending: false,
          error: new Error('Test Error'),
        });
      });
    });

    describe('advanced', () => {
      it('should be pending and then fulfilled', () => {
        const [mutation, input$] = setup();

        mutation(input$);
        expect(mutation.status()).toBe('pending');
        input$.next(1);
        input$.complete();
        expect(mutation.status()).toBe('fulfilled');
        expect(mutation.value()).toBe(1);
      });

      it('should be pending if executor observable does not complete', () => {
        const [mutate, input$] = setup();

        expect(mutate.status()).toBe('idle');
        mutate(input$);
        expect(mutate.status()).toBe('pending');
        input$.next(1);
        expect(mutate.status()).toBe('pending');

        input$.complete();
        expect(mutate.status()).toBe('fulfilled');
        expect(mutate.value()).toBe(1);
      });

      it('should set to fulfilled if value is falsy', () => {
        const [mutation, input$] = setup();
        mutation(input$);
        input$.next(0);
        input$.complete();
        expect(mutation.status()).toBe('fulfilled');
        expect(mutation.value()).toBe(0);
      });

      it('should set to fullfilled when Observable completes without value', () => {
        const [mutate, value$] = setup();

        expect(mutate.status()).toBe('idle');
        mutate(value$);
        expect(mutate.status()).toBe('pending');
        value$.complete();
        expect(mutate.status()).toBe('fulfilled');
        expect(mutate.value()).toBe(undefined);
      });

      it('should set the error when executor throws', () => {
        const testError = new Error('Test Error');
        const increment = createRxMutation(() => {
          throw testError;
        });

        increment(undefined);
        expect(increment.status()).toBe('error');
        expect(increment.error()).toBe(testError);
      });

      it(`should set to error when executor's Observable fires in error channel`, () => {
        const testError = new Error('Test Error');
        const increment = createRxMutation(() => throwError(() => testError));

        increment(1);
        expect(increment.status()).toBe('error');
        expect(increment.error()).toBe(testError);
      });

      it('does not freeze on error', () => {
        const testError = new Error('Test Error');
        const increment = createRxMutation((value: number) =>
          value % 2 === 0 ? of(value) : throwError(() => testError),
        );

        increment(1);
        expect(increment.status()).toBe('error');
        expect(increment.error()).toBe(testError);

        increment(2);
        expect(increment.status()).toBe('fulfilled');
        expect(increment.value()).toBe(2);
      });

      it('should set to fullfilled when onError callback throws', () => {
        const testError = new Error('Test Error');
        const increment = createRxMutation({
          executor: () => throwError(() => testError),
          onError: () => {
            throw new Error('Error in onError callback');
          },
        });

        increment(1);
        expect(increment.status()).toBe('error');
      });

      it('should stay in pending when multiple requests are made', () => {
        const [mutate, value1$, value2$] = setup();

        expect(mutate.status()).toBe('idle');
        mutate(value1$);
        mutate(value2$);
        expect(mutate.status()).toBe('pending');

        value1$.complete();
        expect(mutate.status()).toBe('pending');

        value2$.complete();
        expect(mutate.status()).toBe('fulfilled');
      });

      it('should keep the error until the next mutation starts', () => {
        const [mutate, error$, success$] = setup();

        // First mutation fails
        mutate(error$);
        error$.error(new Error('test error'));

        expect(mutate.error()).toEqual(new Error('test error'));
        expect(mutate.status()).toBe('error');

        // Second mutation succeeds
        mutate(success$);
        expect(mutate.error()).toBeUndefined(); // Error cleared
        expect(mutate.status()).toBe('pending');

        success$.next(42);
        success$.complete();

        expect(mutate.error()).toBeUndefined();
        expect(mutate.status()).toBe('fulfilled');
        expect(mutate.value()).toBe(42);
      });
      it('should keep the value until the next mutation fulfills', () => {
        const [mutate, success1$, success2$] = setup();

        // First mutation succeeds
        mutate(success1$);
        success1$.next(100);
        success1$.complete();

        expect(mutate.value()).toBe(100);
        expect(mutate.status()).toBe('fulfilled');

        // Second mutation starts
        mutate(success2$);
        expect(mutate.value()).toBe(100); // Previous value still present
        expect(mutate.status()).toBe('pending');

        success2$.next(200);
        success2$.complete();

        expect(mutate.value()).toBe(200); // New value after completion
        expect(mutate.status()).toBe('fulfilled');
      });
      it('should keep the value even if the next mutation fails', () => {
        const [mutate, success$, error$] = setup();

        // First mutation succeeds
        mutate(success$);
        success$.next(100);
        success$.complete();

        expect(mutate.value()).toBe(100);
        expect(mutate.status()).toBe('fulfilled');

        // Second mutation fails
        mutate(error$);
        expect(mutate.value()).toBe(100); // Previous value still present
        expect(mutate.status()).toBe('pending');

        error$.error(new Error('test error'));

        expect(mutate.value()).toBe(100); // Previous value preserved after error
        expect(mutate.status()).toBe('error');
        expect(mutate.error()).toEqual(new Error('test error'));
      });

      it('should switch through all values that an executor observable emits', () => {
        const [mutate, input1$] = setup();

        mutate(input1$);

        input1$.next(1);
        expect(mutate.value()).toEqual(1);
        expect(mutate.status()).toBe('pending');

        input1$.next(2);
        expect(mutate.value()).toEqual(2);
        expect(mutate.status()).toBe('pending');

        input1$.complete();
        expect(mutate.value()).toEqual(2);
        expect(mutate.status()).toBe('fulfilled');
      });
    });

    describe('Flattening Behavior', () => {
      it('concatMap: should sequentially process each input', () => {
        const [mutate, input1$, input2$] = setup();

        mutate(input1$);
        mutate(input2$);

        expect(getMutationState(mutate)).toMatchObject({
          status: 'pending',
          value: undefined,
        });

        input1$.next(1);
        expect(mutate.status()).toBe('pending');
        expect(mutate.value()).toBe(1);

        input2$.next(2);
        expect(mutate.status()).toBe('pending');
        expect(mutate.value()).toBe(1);

        input1$.next(3);
        expect(mutate.status()).toBe('pending');
        expect(mutate.value()).toBe(3);

        input1$.complete();
        expect(mutate.status()).toBe('pending');
        expect(mutate.value()).toBe(3);

        input2$.next(4);
        expect(mutate.status()).toBe('pending');
        expect(mutate.value()).toBe(4);

        input2$.complete();
        expect(mutate.status()).toBe('fulfilled');
        expect(mutate.value()).toBe(4);
      });

      it('mergeMap: should process all inputs concurrently', () => {
        const [mutate, input1$, input2$] = setup(mergeMap);

        mutate(input1$);
        mutate(input2$);

        expect(getMutationState(mutate)).toMatchObject({
          status: 'pending',
          value: undefined,
        });

        input1$.next(1);
        expect(mutate.status()).toBe('pending');
        expect(mutate.value()).toBe(1);

        input2$.next(2);
        expect(mutate.status()).toBe('pending');
        expect(mutate.value()).toBe(2);

        input1$.next(3);
        expect(mutate.status()).toBe('pending');
        expect(mutate.value()).toBe(3);

        input1$.complete();
        expect(mutate.status()).toBe('pending');
        expect(mutate.value()).toBe(3);

        input2$.next(4);
        expect(mutate.status()).toBe('pending');
        expect(mutate.value()).toBe(4);

        input2$.complete();
        expect(mutate.status()).toBe('fulfilled');
        expect(mutate.value()).toBe(4);
      });

      it('switchMap: should cancel previous inner observable when a new one is emitted', () => {
        const [mutate, input1$, input2$] = setup(switchMap);

        mutate(input1$);
        mutate(input2$);

        expect(getMutationState(mutate)).toMatchObject({
          status: 'pending',
          value: undefined,
        });

        input1$.next(1);
        expect(mutate.status()).toBe('pending');
        expect(mutate.value()).toBe(undefined);

        input2$.next(2);
        expect(mutate.status()).toBe('pending');
        expect(mutate.value()).toBe(2);

        input1$.next(3);
        expect(mutate.status()).toBe('pending');
        expect(mutate.value()).toBe(2);

        input1$.complete();
        expect(mutate.status()).toBe('pending');
        expect(mutate.value()).toBe(2);

        input2$.next(4);
        expect(mutate.status()).toBe('pending');
        expect(mutate.value()).toBe(4);

        input2$.complete();
        expect(mutate.status()).toBe('fulfilled');
        expect(mutate.value()).toBe(4);
      });

      it('exhaustMap: should ignore new inner observables while the previous one is still processing', () => {
        const [mutate, input1$, input2$] = setup(exhaustMap);

        mutate(input1$);
        mutate(input2$);

        expect(getMutationState(mutate)).toMatchObject({
          status: 'pending',
          value: undefined,
        });

        input1$.next(1);
        expect(mutate.status()).toBe('pending');
        expect(mutate.value()).toBe(1);

        input2$.next(2);
        expect(mutate.status()).toBe('pending');
        expect(mutate.value()).toBe(1);

        input1$.next(3);
        expect(mutate.status()).toBe('pending');
        expect(mutate.value()).toBe(3);

        input1$.complete();
        expect(mutate.status()).toBe('fulfilled');
        expect(mutate.value()).toBe(3);

        input2$.next(4);
        expect(mutate.status()).toBe('fulfilled');
        expect(mutate.value()).toBe(3);

        input2$.complete();
        expect(mutate.status()).toBe('fulfilled');
        expect(mutate.value()).toBe(3);
      });

      type MutationResultStatus = 'pending' | MutationResult<unknown>;

      /**
       * We are setting up a new mutation with configurable FlatteningOperator
       * That mutation is called with two Observables which the test has to
       * emit via `triggerInput1` and `triggerInput2`.
       */
      function setupForRaceConditions(operator?: FlatteningOperator) {
        const mutation = createRxMutation({
          executor: (input$: Observable<unknown>) => input$,
          operator,
        });

        const status = {
          promise1: 'pending' as MutationResultStatus,
          promise2: 'pending' as MutationResultStatus,
          subscriberCount1: 0,
          subscriberCount2: 0,
        };

        // setup trigger for 1st Observable
        let input1$Trigger: Subscriber<number> | undefined;
        const input1$ = new Observable((subscriber) => {
          status.subscriberCount1++;
          input1$Trigger = subscriber;
        });
        const triggerInput1 = (value: number) => {
          if (input1$Trigger === undefined) {
            throw new Error("Input 1 hasn't been subscribed to yet");
          }
          input1$Trigger.next(value);
          input1$Trigger.complete();
        };

        // setup trigger for 2nd Observable
        let input2$Trigger: Subscriber<number> | undefined;
        const input2$ = new Observable((subscriber) => {
          status.subscriberCount2++;
          input2$Trigger = subscriber;
        });
        const triggerInput2 = (value: number) => {
          if (input2$Trigger === undefined) {
            throw new Error("Input 2 hasn't been subscribed to yet");
          }
          input2$Trigger.next(value);
          input2$Trigger.complete();
        };

        mutation(input1$).then((result) => {
          status.promise1 = result;
        });

        mutation(input2$).then((result) => {
          status.promise2 = result;
        });

        return { mutation, triggerInput1, triggerInput2, status };
      }

      it('concatMap: does not subscribe to second when first has not completed', async () => {
        const { triggerInput2, status } = setupForRaceConditions();

        expect(status).toEqual({
          promise1: 'pending',
          promise2: 'pending',
          subscriberCount1: 1,
          subscriberCount2: 0,
        });

        expect(() => triggerInput2(2)).toThrow(
          "Input 2 hasn't been subscribed to yet",
        );
      });

      it('concatMap: subscribes and executes observables sequentially', async () => {
        const { triggerInput1, triggerInput2, status } =
          setupForRaceConditions();

        triggerInput1(1);
        await asyncTick();

        expect(status).toEqual({
          promise1: { status: 'fulfilled', value: 1 },
          promise2: 'pending',
          subscriberCount1: 1,
          subscriberCount2: 1,
        });

        triggerInput2(2);
        await asyncTick();

        expect(status).toEqual({
          promise1: { status: 'fulfilled', value: 1 },
          promise2: { status: 'fulfilled', value: 2 },
          subscriberCount1: 1,
          subscriberCount2: 1,
        });
      });

      it('mergeMap: subscribes immediately and does not block', async () => {
        const { triggerInput1, triggerInput2, status } =
          setupForRaceConditions(mergeMap);

        expect(status).toEqual({
          promise1: 'pending',
          promise2: 'pending',
          subscriberCount1: 1,
          subscriberCount2: 1,
        });

        triggerInput2(2);
        await asyncTick();

        expect(status).toEqual({
          promise1: 'pending',
          promise2: { status: 'fulfilled', value: 2 },
          subscriberCount1: 1,
          subscriberCount2: 1,
        });

        triggerInput1(1);
        await asyncTick();

        expect(status).toEqual({
          promise1: { status: 'fulfilled', value: 1 },
          promise2: { status: 'fulfilled', value: 2 },
          subscriberCount1: 1,
          subscriberCount2: 1,
        });
      });

      it.skip('exhaustMap: rejects all subsequent inputs until the first one resolves (exhaustMap)', async () => {
        const { triggerInput1, status } = setupForRaceConditions(exhaustMap);

        expect(status).toEqual({
          promise1: 'pending',
          promise2: 'cancelled',
          subscriberCount1: 1,
          subscriberCount2: 0,
        });

        triggerInput1(1);
        await asyncTick();

        expect(status).toEqual({
          promise1: { status: 'fulfilled', value: 1 },
          promise2: { status: 'cancelled' },
        });
      });

      it('switchMap: cancels the first, when a new request comes in', async () => {
        const { triggerInput1, triggerInput2, status } =
          setupForRaceConditions(switchMap);

        expect(status).toEqual({
          promise1: 'pending',
          promise2: 'pending',
          subscriberCount1: 1,
          subscriberCount2: 1,
        });

        await asyncTick();

        expect(status).toEqual({
          promise1: { status: 'cancelled' },
          promise2: 'pending',
          subscriberCount1: 1,
          subscriberCount2: 1,
        });

        triggerInput1(1);
        triggerInput2(2);
        await asyncTick();

        expect(status).toEqual({
          promise1: { status: 'cancelled' },
          promise2: { status: 'fulfilled', value: 2 },
          subscriberCount1: 1,
          subscriberCount2: 1,
        });
      });
    });
  });

  describe('MutationResult', () => {
    describe('basic', () => {
      it('cancels calls with multiple requests sequentially', async () => {
        const [mutate, value$] = setup();

        const promise = mutate(value$);

        value$.next(1);
        value$.next(2);
        value$.complete();

        const mutationResult = await promise;

        expect(mutationResult).toEqual({ status: 'fulfilled', value: 2 });
      });

      it('resolves only after executor observable has been completed', async () => {
        let isResolved = false;
        const [mutate, value$] = setup();

        mutate(value$).then(() => (isResolved = true));

        value$.next(1);
        await asyncTick();
        expect(isResolved).toBe(false);

        value$.next(2);
        await asyncTick();
        expect(isResolved).toBe(false);

        value$.complete();
        await asyncTick();
        expect(isResolved).toBe(true);
      });

      it('Observable completing without emitting is MutationStatus cancelled', async () => {
        const [mutate, value$] = setup();
        const promise = mutate(value$);
        value$.complete();

        const mutationStatus = await promise;
        expect(mutationStatus).toEqual({ status: 'cancelled' });
      });

      it('ends in error, if observable throws', async () => {
        const [mutate, value$] = setup();
        const promise = mutate(value$);
        value$.error(new Error('test error'));

        const mutationStatus = await promise;
        expect(mutationStatus).toEqual({
          status: 'error',
          error: new Error('test error'),
        });
      });
    });

    describe('Flattening Behavior', () => {
      type MutationResultStatus = 'pending' | MutationResult<unknown>;

      /**
       * We are setting up a new mutation with configurable FlatteningOperator
       * That mutation is called with two Observables which the test has to
       * emit via `triggerInput1` and `triggerInput2`.
       */
      function setupForRaceConditions(operator?: FlatteningOperator) {
        const mutation = createRxMutation({
          executor: (input$: Observable<unknown>) => input$,
          operator,
        });

        const status = {
          promise1: 'pending' as MutationResultStatus,
          promise2: 'pending' as MutationResultStatus,
          subscriberCount1: 0,
          subscriberCount2: 0,
        };

        // setup trigger for 1st Observable
        let input1$Trigger: Subscriber<number> | undefined;
        const input1$ = new Observable((subscriber) => {
          status.subscriberCount1++;
          input1$Trigger = subscriber;
        });
        const triggerInput1 = (value: number) => {
          if (input1$Trigger === undefined) {
            throw new Error("Input 1 hasn't been subscribed to yet");
          }
          input1$Trigger.next(value);
          input1$Trigger.complete();
        };

        // setup trigger for 2nd Observable
        let input2$Trigger: Subscriber<number> | undefined;
        const input2$ = new Observable((subscriber) => {
          status.subscriberCount2++;
          input2$Trigger = subscriber;
        });
        const triggerInput2 = (value: number) => {
          if (input2$Trigger === undefined) {
            throw new Error("Input 2 hasn't been subscribed to yet");
          }
          input2$Trigger.next(value);
          input2$Trigger.complete();
        };

        mutation(input1$).then((result) => {
          status.promise1 = result;
        });

        mutation(input2$).then((result) => {
          status.promise2 = result;
        });

        return { mutation, triggerInput1, triggerInput2, status };
      }

      it('concatMap: does not subscribe to second when first has not completed', async () => {
        const { triggerInput2, status } = setupForRaceConditions();

        expect(status).toEqual({
          promise1: 'pending',
          promise2: 'pending',
          subscriberCount1: 1,
          subscriberCount2: 0,
        });

        expect(() => triggerInput2(2)).toThrow(
          "Input 2 hasn't been subscribed to yet",
        );
      });

      it('concatMap: subscribes and executes observables sequentially', async () => {
        const { triggerInput1, triggerInput2, status } =
          setupForRaceConditions();

        triggerInput1(1);
        await asyncTick();

        expect(status).toEqual({
          promise1: { status: 'fulfilled', value: 1 },
          promise2: 'pending',
          subscriberCount1: 1,
          subscriberCount2: 1,
        });

        triggerInput2(2);
        await asyncTick();

        expect(status).toEqual({
          promise1: { status: 'fulfilled', value: 1 },
          promise2: { status: 'fulfilled', value: 2 },
          subscriberCount1: 1,
          subscriberCount2: 1,
        });
      });

      it('mergeMap: subscribes immediately and does not block', async () => {
        const { triggerInput1, triggerInput2, status } =
          setupForRaceConditions(mergeMap);

        expect(status).toEqual({
          promise1: 'pending',
          promise2: 'pending',
          subscriberCount1: 1,
          subscriberCount2: 1,
        });

        triggerInput2(2);
        await asyncTick();

        expect(status).toEqual({
          promise1: 'pending',
          promise2: { status: 'fulfilled', value: 2 },
          subscriberCount1: 1,
          subscriberCount2: 1,
        });

        triggerInput1(1);
        await asyncTick();

        expect(status).toEqual({
          promise1: { status: 'fulfilled', value: 1 },
          promise2: { status: 'fulfilled', value: 2 },
          subscriberCount1: 1,
          subscriberCount2: 1,
        });
      });

      it.skip('exhaustMap: rejects all subsequent inputs until the first one resolves (exhaustMap)', async () => {
        const { triggerInput1, status } = setupForRaceConditions(exhaustMap);

        expect(status).toEqual({
          promise1: 'pending',
          promise2: 'cancelled',
          subscriberCount1: 1,
          subscriberCount2: 0,
        });

        triggerInput1(1);
        await asyncTick();

        expect(status).toEqual({
          promise1: { status: 'fulfilled', value: 1 },
          promise2: { status: 'cancelled' },
        });
      });

      it('switchMap: cancels the first, when a new request comes in', async () => {
        const { triggerInput1, triggerInput2, status } =
          setupForRaceConditions(switchMap);

        expect(status).toEqual({
          promise1: 'pending',
          promise2: 'pending',
          subscriberCount1: 1,
          subscriberCount2: 1,
        });

        await asyncTick();

        expect(status).toEqual({
          promise1: { status: 'cancelled' },
          promise2: 'pending',
          subscriberCount1: 1,
          subscriberCount2: 1,
        });

        triggerInput1(1);
        triggerInput2(2);
        await asyncTick();

        expect(status).toEqual({
          promise1: { status: 'cancelled' },
          promise2: { status: 'fulfilled', value: 2 },
          subscriberCount1: 1,
          subscriberCount2: 1,
        });
      });
    });
  });

  describe('Injector', () => {
    it('accepts a different injector', () => {
      const injector = createEnvironmentInjector(
        [],
        TestBed.inject(EnvironmentInjector),
      );

      const mutate = createRxMutation({
        executor: (value$: Observable<number>) => value$,
        injector,
      });

      mutate(of(1));

      expect(mutate.value()).toBe(1);

      injector.destroy();

      mutate(of(2));
      expect(mutate.value()).toBe(1);
    });

    it('fails if no injector exists', () => {
      expect(() => rxMutation((value: number) => of(value))).toThrow();
    });
  });
});
