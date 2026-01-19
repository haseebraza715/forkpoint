import { promises as fs } from "fs";
import path from "path";

type ReflectionEntry = {
  id: string;
  title: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  status: string;
  wordCount: number;
};

type ReflectionFeedback = {
  id?: string;
  entryId: string;
  agent: string;
  content: string;
  createdAt: Date;
  model?: string;
  promptVersion?: string;
};

type ReflectionSnapshot = {
  entry: ReflectionEntry;
  feedback: ReflectionFeedback[];
};

export async function writeReflectionSnapshot(snapshot: ReflectionSnapshot) {
  const baseDir = path.join(process.cwd(), "reflections");
  await fs.mkdir(baseDir, { recursive: true });

  const payload = {
    savedAt: new Date().toISOString(),
    entry: {
      ...snapshot.entry,
      createdAt: snapshot.entry.createdAt.toISOString(),
      updatedAt: snapshot.entry.updatedAt.toISOString()
    },
    feedback: snapshot.feedback.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString()
    }))
  };

  const filePath = path.join(baseDir, `${snapshot.entry.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}
