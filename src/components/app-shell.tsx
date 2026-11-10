"use client";

import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { PasswordGate } from "@/components/password-gate";
import { useAuthStore } from "@/lib/auth-store";

const useAuthHydrated = () =>
  useSyncExternalStore(
    (onChange) => useAuthStore.persist.onFinishHydration(onChange),
    () => useAuthStore.persist.hasHydrated(),
    () => false
  );

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);

  const {
    data: isValid,
    isPending: isChecking,
    isError,
  } = useQuery({
    queryKey: ["auth-validate", token],
    queryFn: async () => {
      const res = await fetch("/api/auth", { headers: { "x-auth-token": token } });
      const body = await res.json();
      return body.valid === true;
    },
    enabled: hydrated && Boolean(token),
    retry: 1,
    staleTime: 0,
  });

  if (!hydrated || (token && isChecking)) {
    return <div className="min-h-dvh" style={{ backgroundColor: "var(--background)" }} />;
  }

  if (!token || isValid === false || isError) {
    return <PasswordGate onSuccess={() => {}} />;
  }

  return (
    <div
      className="flex h-dvh min-h-0 flex-col overflow-y-auto"
      style={{ backgroundColor: "var(--background)" }}
    >
      {children}
    </div>
  );
};
