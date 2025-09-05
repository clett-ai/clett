"use client";
import { useEffect } from "react";

const PLAN_ROUTES: Record<string, string> = {
  member: "/member",
  lifetime: "/lifetime",
  team: "/team",
};

export default function Home() {
  useEffect(() => {
    // 1) Remove ?access_token after Outseta stores the session cookie
    const u = new URL(window.location.href);
    if (u.searchParams.has("access_token")) {
      history.replaceState(null, "", u.pathname);
    }

    // 2) Ask Outseta for the current user, then route by plan name
    const go = async () => {
      // @ts-ignore – Outseta widget
      const Outseta = (window as any).Outseta;
      if (!Outseta || !Outseta.getCurrentUser) return;

      try {
        const user = await Outseta.getCurrentUser();
        const planName =
          user?.Account?.Subscriptions?.[0]?.Plan?.Name?.toLowerCase() || "";

        const dest = PLAN_ROUTES[planName];
        if (dest) {
          // stay on same host (my.clett.ai)
          window.location.replace(dest);
        }
      } catch {
        // ignore – show minimal page
      }
    };
    // Give the Outseta script a tick to initialize
    setTimeout(go, 300);
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Clett</h1>
      <p>Finishing login…</p>
    </main>
  );
}
