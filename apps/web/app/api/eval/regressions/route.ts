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
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json({ error: "from and to are required" }, { status: 400 });
    }

    const db = await getDb();
    const evaluations = db.collection("evaluations");

    const pipeline = (promptVersion: string) => [
      { $match: { "result.promptVersion": promptVersion } },
      {
        $project: {
          verdict: "$result.verdict",
          overallScore: "$result.overallScore",
          violations: { $ifNull: ["$result.violations", []] }
        }
      },
      {
        $facet: {
          verdicts: [
            {
              $group: {
                _id: "$verdict",
                count: { $sum: 1 }
              }
            }
          ],
          violations: [
            { $unwind: "$violations" },
            {
              $group: {
                _id: "$violations",
                count: { $sum: 1 }
              }
            },
            { $sort: { count: -1 } }
          ],
          scoreStats: [
            {
              $group: {
                _id: null,
                avgScore: { $avg: "$overallScore" },
                minScore: { $min: "$overallScore" },
                maxScore: { $max: "$overallScore" },
                total: { $sum: 1 }
              }
            }
          ]
        }
      }
    ];

    const [fromResult] = await evaluations.aggregate(pipeline(from)).toArray();
    const [toResult] = await evaluations.aggregate(pipeline(to)).toArray();

    // Calculate deltas
    const fromStats = fromResult.scoreStats[0] || { avgScore: 0, minScore: 0, maxScore: 0, total: 0 };
    const toStats = toResult.scoreStats[0] || { avgScore: 0, minScore: 0, maxScore: 0, total: 0 };

    const fromPassCount = fromResult.verdicts.find((v: { _id: string; count: number }) => v._id === "pass")?.count || 0;
    const toPassCount = toResult.verdicts.find((v: { _id: string; count: number }) => v._id === "pass")?.count || 0;
    const fromTotal = fromStats.total || 1;
    const toTotal = toStats.total || 1;

    const deltas = {
      avgScoreDelta: toStats.avgScore - fromStats.avgScore,
      passRateDelta: (toPassCount / toTotal) - (fromPassCount / fromTotal),
      totalDelta: toStats.total - fromStats.total
    };

    return NextResponse.json({
      from: {
        promptVersion: from,
        verdicts: fromResult.verdicts,
        violations: fromResult.violations,
        scoreStats: fromStats
      },
      to: {
        promptVersion: to,
        verdicts: toResult.verdicts,
        violations: toResult.violations,
        scoreStats: toStats
      },
      deltas
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
