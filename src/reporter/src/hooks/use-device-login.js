import { useEffect, useRef, useState } from 'react';
import {
  useInitiateLogin,
  usePollAuthorization,
} from './queries/use-auth-queries.js';

export function useDeviceLogin({ onComplete }) {
  let [login, setLogin] = useState({ status: 'idle' });
  let [checking, setChecking] = useState(false);
  let attempt = useRef({ generation: 0, active: false, checking: false });
  let { mutateAsync: initiate } = useInitiateLogin();
  let { mutateAsync: poll } = usePollAuthorization();

  useEffect(
    () => () => {
      attempt.current.generation++;
    },
    []
  );

  async function start() {
    if (attempt.current.active) return;
    let generation = ++attempt.current.generation;
    attempt.current.active = true;
    setLogin({ status: 'starting' });
    try {
      let flow = await initiate();
      if (generation !== attempt.current.generation) return;
      attempt.current.flow = flow;
      setLogin({ status: 'pending', flow });
    } catch (error) {
      if (generation !== attempt.current.generation) return;
      attempt.current.active = false;
      setLogin({ status: 'error', error });
    }
  }

  async function check() {
    let current = attempt.current;
    if (!current.flow || !current.active || current.checking) return;
    let generation = current.generation;
    current.checking = true;
    setChecking(true);
    setLogin({ status: 'pending', flow: current.flow });
    try {
      let result = await poll(current.flow.deviceCode);
      if (generation !== attempt.current.generation) return;
      if (
        !['pending', 'complete', 'denied', 'expired', 'invalid'].includes(
          result.status
        )
      ) {
        throw new Error('Unexpected response from authorization server');
      }
      current.active = result.status === 'pending';
      setLogin({ status: result.status, flow: current.flow });
      if (result.status === 'complete') onComplete();
    } catch (error) {
      if (generation !== attempt.current.generation) return;
      setLogin({ status: 'pending', flow: current.flow, error });
    } finally {
      if (generation === attempt.current.generation) {
        current.checking = false;
        setChecking(false);
      }
    }
  }

  function dismiss() {
    attempt.current = {
      generation: attempt.current.generation + 1,
      active: false,
      checking: false,
    };
    setChecking(false);
    setLogin({ status: 'idle' });
  }

  return { ...login, checking, start, check, dismiss };
}
