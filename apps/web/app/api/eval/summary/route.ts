import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";
import { isEvalEnabled } from "@/lib/eval-mode";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!isEvalEnabled()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");

    const db = await getDb();
    const evaluations = db.collection("evaluations");

    // Build date filter if provided
    type DateFilter = { createdAt?: { $gte?: Date; $lte?: Date } };
    const dateFilter: DateFilter = {};
    if (fromDate || toDate) {
      dateFilter.createdAt = {};
      if (fromDate) {
        dateFilter.createdAt.$gte = new Date(fromDate);
      }
      if (toDate) {
        dateFilter.createdAt.$lte = new Date(toDate);
      }
    }

    const matchStage = Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : [];

    const totals = await evaluations
      .aggregate([
        ...matchStage,
        {
          $group: {
            _id: "$result.verdict",
            count: { $sum: 1 }
          }
        }
      ])
      .toArray();

    const overall = await evaluations
      .aggregate([
        ...matchStage,
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            avgScore: { $avg: "$result.overallScore" },
            minScore: { $min: "$result.overallScore" },
            maxScore: { $max: "$result.overallScore" }
          }
        }
      ])
      .toArray();

    const byPromptVersion = await evaluations
      .aggregate([
        ...matchStage,
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

    const promptStats = await evaluations
      .aggregate([
        ...matchStage,
        {
          $group: {
            _id: "$result.promptVersion",
            total: { $sum: 1 },
            avgScore: { $avg: "$result.overallScore" },
            minScore: { $min: "$result.overallScore" },
            maxScore: { $max: "$result.overallScore" }
          }
        },
        { $sort: { _id: -1 } }
      ])
      .toArray();

    const topViolations = await evaluations
      .aggregate([
        ...matchStage,
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
        ...matchStage,
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
        ...matchStage,
        {
          $group: {
            _id: "$result.redundancy.severity",
            count: { $sum: 1 }
          }
        }
      ])
      .toArray();

    const agentRolePurity = await evaluations
      .aggregate([
        ...matchStage,
        {
          $project: {
            agentEvals: { $objectToArray: "$result.agentEvals" }
          }
        },
        { $unwind: "$agentEvals" },
        {
          $group: {
            _id: {
              agent: "$agentEvals.k",
              rolePurity: "$agentEvals.v.rolePurity"
            },
            count: { $sum: 1 }
          }
        }
      ])
      .toArray();

    const agentFormat = await evaluations
      .aggregate([
        ...matchStage,
        {
          $project: {
            agentEvals: { $objectToArray: "$result.agentEvals" }
          }
        },
        { $unwind: "$agentEvals" },
        {
          $group: {
            _id: {
              agent: "$agentEvals.k",
              formatCompliance: "$agentEvals.v.formatCompliance"
            },
            count: { $sum: 1 }
          }
        }
      ])
      .toArray();

    const agentPressure = await evaluations
      .aggregate([
        ...matchStage,
        {
          $project: {
            agentEvals: { $objectToArray: "$result.agentEvals" }
          }
        },
        { $unwind: "$agentEvals" },
        {
          $group: {
            _id: {
              agent: "$agentEvals.k",
              pressureLevel: "$agentEvals.v.pressureLevel"
            },
            count: { $sum: 1 }
          }
        }
      ])
      .toArray();

    const recent = await evaluations
      .find(dateFilter, {
        projection: {
          "result.entryId": 1,
          "result.verdict": 1,
          "result.overallScore": 1,
          "result.timestamp": 1,
          "result.promptVersion": 1,
          "result.violations": 1,
          "result.agentEvals": 1
        }
      })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    return NextResponse.json({
      totals,
      overall: overall[0] ?? { total: 0, avgScore: 0, minScore: 0, maxScore: 0 },
      byPromptVersion,
      promptStats,
      topViolations,
      byPromptVersionViolations,
      redundancy,
      agentRolePurity,
      agentFormat,
      agentPressure,
      recent
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
