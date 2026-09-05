import { defineStore as definePiniaStore, getActivePinia, type Pinia } from 'pinia';
import { isReadonly, isRef, onScopeDispose, toRaw } from 'vue';
import { invalidateSessionRequests } from '../api/client';

const resets = new WeakMap<Pinia, Set<() => void>>();

/** Setup stores need an explicit reset; computed refs must remain derived. */
export function defineStore<Id extends string, State extends Record<string, unknown>>(
  id: Id,
  setup: () => State,
) {
  return definePiniaStore(id, () => {
    const state = setup();
    const pinia = getActivePinia()!;
    const snapshots = Object.values(state)
      .filter((value) => isRef(value) && !isReadonly(value))
      .map((value) => ({
        ref: value as { value: unknown },
        initial: structuredClone(toRaw((value as { value: unknown }).value)),
      }));
    const reset = () => {
      for (const snapshot of snapshots) snapshot.ref.value = structuredClone(snapshot.initial);
    };
    let callbacks = resets.get(pinia);
    if (!callbacks) resets.set(pinia, (callbacks = new Set()));
    callbacks.add(reset);
    onScopeDispose(() => callbacks.delete(reset));
    return state;
  });
}

export function resetSessionState(pinia: Pinia) {
  invalidateSessionRequests();
  for (const reset of resets.get(pinia) ?? []) reset();
}
