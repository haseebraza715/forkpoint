import { notFound } from "next/navigation";

import { isEvalEnabled } from "@/lib/eval-mode";
import EvalDashboard from "./EvalDashboard";

export default function EvalDashboardPage() {
  if (!isEvalEnabled()) {
    notFound();
  }

  return <EvalDashboard />;
}
