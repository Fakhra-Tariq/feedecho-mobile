/**
 * Shared host workspace invalidation.
 * HostSessionProvider registers the refetch; mutation helpers call notifyHostDataMutated
 * so local create/launch/end/delete refresh lists immediately (no 450 ms ping wait).
 */

type HostDataSyncHandlers = {
  refetchImmediate: () => Promise<void>;
};

let handlers: HostDataSyncHandlers | null = null;

export function registerHostDataSync(next: HostDataSyncHandlers) {
  handlers = next;
}

export function unregisterHostDataSync() {
  handlers = null;
}

export function notifyHostDataMutated() {
  void handlers?.refetchImmediate();
}
