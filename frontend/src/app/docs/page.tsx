"use client";

import dynamic from "next/dynamic";

const DocsPage = dynamic(() => import("@frontend/docs"), {
  ssr: false,
  loading: () => <p style={{ padding: 24 }}>Loading docs…</p>,
});

export default function DocsRoute() {
  return <DocsPage />;
}
