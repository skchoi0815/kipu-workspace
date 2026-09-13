"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface ConfirmState {
  message: string;
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<(message: string) => Promise<boolean>>(
  async () => false
);

export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      setState({ message, resolve });
    });
  }, []);

  const answer = (value: boolean) => {
    setState((current) => {
      current?.resolve(value);
      return null;
    });
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-[#DFE4EC] rounded-xl w-full max-w-sm p-6 shadow-xl">
            <p className="text-sm text-[#111823] whitespace-pre-wrap leading-relaxed">
              {state.message}
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => answer(false)}
                className="px-4 py-1.5 border border-[#DFE4EC] rounded text-xs font-semibold text-[#3B4653] hover:bg-[#F4F6FA] transition"
              >
                취소
              </button>
              <button
                onClick={() => answer(true)}
                className="px-4 py-1.5 bg-[#BF3329] text-white rounded text-xs font-bold hover:bg-[#96271F] transition"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
