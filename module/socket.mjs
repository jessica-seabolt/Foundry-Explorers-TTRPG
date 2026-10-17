import { SYSTEM_ID } from '../constants.mjs';

const socketName = () => `system.${SYSTEM_ID}`;
const RESPONSE_ACTION = "response";
const REQUEST_TIMEOUT_MS = 10000;
const handlers = {};
const pendingRequests = new Map();

export function registerSocketHandler(action, handler) {
  handlers[action] = handler;
}

export function emitToGM(action, data) {
  if (!game.users.activeGM) {
    ui.notifications.warn("SYSTEM.Socket.NoGM", { localize: true });
    return false;
  }
  game.socket.emit(socketName(), { ...data, action });
  return true;
}

export function emitToUser(userId, action, data) {
  game.socket.emit(socketName(), { ...data, action, toUserId: userId });
}

export function requestFromGM(action, data, { timeout = REQUEST_TIMEOUT_MS } = {}) {
  if (!game.users.activeGM) {
    ui.notifications.warn("SYSTEM.Socket.NoGM", { localize: true });
    return Promise.resolve(undefined);
  }
  const requestId = foundry.utils.randomID();
  return new Promise(resolve => {
    const timer = timeout ? setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(undefined);
    }, timeout) : null;
    pendingRequests.set(requestId, result => {
      clearTimeout(timer);
      resolve(result);
    });
    game.socket.emit(socketName(), { ...data, action, requestId, userId: game.user.id });
  });
}

export function initSocket() {
  game.socket.on(socketName(), async data => {
    if (data?.action === RESPONSE_ACTION) {
      if (data.userId !== game.user.id) return;
      pendingRequests.get(data.requestId)?.(data.result);
      pendingRequests.delete(data.requestId);
      return;
    }
    if (data?.toUserId) {
      if (data.toUserId === game.user.id) await handlers[data.action]?.(data);
      return;
    }
    if (!game.user.isActiveGM) return;
    const result = await handlers[data?.action]?.(data);
    if (data.requestId) {
      game.socket.emit(socketName(), { action: RESPONSE_ACTION, requestId: data.requestId, userId: data.userId, result: result ?? null });
    }
  });
}
