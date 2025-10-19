// src/pages/api/tracking.ts
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log(process.cwd());
  const filePath = path.join(process.cwd(), "public", "tracking.min.js");
  const jsContent = fs.readFileSync(filePath, "utf-8");

  res.setHeader("Content-Type", "application/javascript");
  res.status(200).send(jsContent);
}
