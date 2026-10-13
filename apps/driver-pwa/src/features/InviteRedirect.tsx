"use client";

import { useEffect } from "react";

export function InviteRedirect() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.get("type") !== "invite" || !params.get("access_token")) return;
    window.location.replace(`/set-password${window.location.hash}`);
  }, []);

  return null;
}
