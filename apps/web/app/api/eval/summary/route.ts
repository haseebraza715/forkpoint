import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET() {
  try {
    if (process.env.EVAL_MODE !== "true") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const db = await getDb();
    const evaluations = db.collection("evaluations");

    const totals = await evaluations
      .aggregate([
        {
          $group: {
            _id: "$result.verdict",
            count: { $sum: 1 }
          }
        }
      ])
      .toArray();

    const byPromptVersion = await evaluations
      .aggregate([
        {
          $group: {
            _id: {
              promptVersion: "$result.promptVersion",
              verdict: "$result.verdict"
            },
            count: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: "$_id.promptVersion",
            verdicts: {
              $push: {
                verdict: "$_id.verdict",
                count: "$count"
              }
            },
            total: { $sum: "$count" }
          }
        },
        { $sort: { _id: -1 } }
      ])
      .toArray();

    const topViolations = await evaluations
      .aggregate([
        {
          $project: {
            violations: { $ifNull: ["$result.violations", []] }
          }
        },
        { $unwind: "$violations" },
        {
          $group: {
            _id: "$violations",
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
      .toArray();

    const byPromptVersionViolations = await evaluations
      .aggregate([
        {
          $project: {
            promptVersion: "$result.promptVersion",
            violations: { $ifNull: ["$result.violations", []] }
          }
        },
        { $unwind: "$violations" },
        {
          $group: {
            _id: {
              promptVersion: "$promptVersion",
              violation: "$violations"
            },
            count: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: "$_id.promptVersion",
            violations: {
              $push: {
                violation: "$_id.violation",
                count: "$count"
              }
            }
          }
        },
        { $sort: { _id: -1 } }
      ])
      .toArray();

    const redundancy = await evaluations
      .aggregate([
        {
          $group: {
            _id: "$result.redundancy.severity",
            count: { $sum: 1 }
          }
        }
      ])
      .toArray();

    const recent = await evaluations
      .find(
        {},
        {
          projection: {
            "result.entryId": 1,
            "result.verdict": 1,
            "result.overallScore": 1,
            "result.timestamp": 1,
            "result.promptVersion": 1
          }
        }
      )
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    return NextResponse.json({
      totals,
      byPromptVersion,
      topViolations,
      byPromptVersionViolations,
      redundancy,
      recent
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
