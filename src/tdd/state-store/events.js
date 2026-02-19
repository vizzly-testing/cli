import { EventEmitter } from 'node:events';

let stateEmitters = new Map();

function getStateEmitter(workingDir) {
  let emitter = stateEmitters.get(workingDir);
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(100);
    stateEmitters.set(workingDir, emitter);
  }
  return emitter;
}

export function emitStateChanged(workingDir) {
  getStateEmitter(workingDir).emit('changed');
}

export function subscribeToStateChanges(workingDir, listener) {
  let emitter = getStateEmitter(workingDir);
  emitter.on('changed', listener);
  return () => emitter.off('changed', listener);
}
