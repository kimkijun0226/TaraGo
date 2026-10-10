import { createContext, useContext, type ReactNode } from 'react';
import { useAlertRuntime } from '../model/use-alert-runtime';

const RuntimeError = createContext<string|null>(null);
export function AlertRuntimeProvider({children}:{children:ReactNode}) {
  const error = useAlertRuntime();
  return <RuntimeError.Provider value={error}>{children}</RuntimeError.Provider>;
}
export function useAlertRuntimeError() { return useContext(RuntimeError); }
