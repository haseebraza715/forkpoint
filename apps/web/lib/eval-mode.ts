export function isEvalEnabled() {
  if (process.env.EVAL_MODE !== "true") {
    return false;
  }
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  return process.env.EVAL_MODE_ALLOW_PROD === "true";
}
