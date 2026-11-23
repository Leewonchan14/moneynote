import { Suspense } from "react";

import { LedgerPage } from "@/components/ledger/ledger-page";

// 지도에서 고른 장소를 주소 쿼리(?place=)에서 읽으므로 정적 렌더링 때 Suspense 경계가 필요하다.
const HomePage = () => (
  <Suspense>
    <LedgerPage />
  </Suspense>
);

export default HomePage;
