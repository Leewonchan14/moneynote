import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 가계부 보기 설정. 이 브라우저에만 기억한다. */
interface LedgerViewState {
  /** 장소 사진을 크게 보여 줄지. 기본은 작은 사진 한 줄 */
  largePlacePhotos: boolean;
  setLargePlacePhotos: (value: boolean) => void;
}

export const useLedgerViewStore = create<LedgerViewState>()(
  persist(
    (set) => ({
      largePlacePhotos: false,
      setLargePlacePhotos: (largePlacePhotos) => set({ largePlacePhotos }),
    }),
    { name: "moneynote-ledger-view" }
  )
);
