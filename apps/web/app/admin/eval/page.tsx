import { notFound } from "next/navigation";

import { isEvalEnabled } from "@/lib/eval-mode";
import EvalPanel from "./EvalPanel";

export default function EvalPage() {
  if (!isEvalEnabled()) {
    notFound();
  }

  return <EvalPanel />;
}
