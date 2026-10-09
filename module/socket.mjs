import { SYSTEM_ID } from '../constants.mjs';

const SOCKET_NAME = `system.${SYSTEM_ID}`;
const RESPONSE_ACTION = "response";
const REQUEST_TIMEOUT_MS = 10000;
const handlers = {};
const pendingRequests = new Map();

/** Registers a function the active GM runs when a player asks for `action` over the socket. Its return value is sent back. */
export function registerSocketHandler(action, handler) {
  handlers[action] = handler;
}

/** Asks the active GM to run `action`. Returns false (and warns) if no GM is connected. */
export function emitToGM(action, data) {
  if (!game.users.activeGM) {
    ui.notifications.warn("SYSTEM.Socket.NoGM", { localize: true });
    return false;
  }
  game.socket.emit(SOCKET_NAME, { ...data, action });
  return true;
}

/**
 * Asks the active GM to run `action` and waits for it to finish.
 * Resolves with the handler's result, or undefined if no GM is connected or it takes too long.
 */
export function requestFromGM(action, data) {
  if (!game.users.activeGM) {
    ui.notifications.warn("SYSTEM.Socket.NoGM", { localize: true });
    return Promise.resolve(undefined);
  }
  const requestId = foundry.utils.randomID();
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(undefined);
    }, REQUEST_TIMEOUT_MS);
    pendingRequests.set(requestId, result => {
      clearTimeout(timeout);
      resolve(result);
    });
    game.socket.emit(SOCKET_NAME, { ...data, action, requestId, userId: game.user.id });
  });
}

export function initSocket() {
  game.socket.on(SOCKET_NAME, async data => {
    if (data?.action === RESPONSE_ACTION) {
      if (data.userId !== game.user.id) return;
      pendingRequests.get(data.requestId)?.(data.result);
      pendingRequests.delete(data.requestId);
      return;
    }
    if (!game.user.isActiveGM) return;
    const result = await handlers[data?.action]?.(data);
    if (data.requestId) {
      game.socket.emit(SOCKET_NAME, { action: RESPONSE_ACTION, requestId: data.requestId, userId: data.userId, result: result ?? null });
    }
  });
}
