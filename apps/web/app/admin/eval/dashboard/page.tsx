import { notFound } from "next/navigation";

import EvalDashboard from "./EvalDashboard";

export default function EvalDashboardPage() {
  if (process.env.EVAL_MODE !== "true") {
    notFound();
  }

  return <EvalDashboard />;
}
