import { notFound } from "next/navigation";

import EvalPanel from "./EvalPanel";

export default function EvalPage() {
  if (process.env.EVAL_MODE !== "true") {
    notFound();
  }

  return <EvalPanel />;
}
