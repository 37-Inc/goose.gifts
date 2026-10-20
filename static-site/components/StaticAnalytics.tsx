"use client";

import { useEffect } from "react";
import { startStaticAnalytics } from "../lib/analytics";

export function StaticAnalytics() {
  useEffect(() => startStaticAnalytics(true), []);
  return null;
}
