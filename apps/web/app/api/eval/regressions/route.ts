import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET(request: Request) {
  try {
    if (process.env.EVAL_MODE !== "true") {
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
          ]
        }
      }
    ];

    const [fromResult] = await evaluations.aggregate(pipeline(from)).toArray();
    const [toResult] = await evaluations.aggregate(pipeline(to)).toArray();

    return NextResponse.json({
      from: { promptVersion: from, ...fromResult },
      to: { promptVersion: to, ...toResult }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
