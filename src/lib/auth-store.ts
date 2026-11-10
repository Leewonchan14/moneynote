import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  token: string;
  login: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: "",
      login: (token) => set({ token }),
      logout: () => set({ token: "" }),
    }),
    {
      name: "moneynote-auth",
    }
  )
);
