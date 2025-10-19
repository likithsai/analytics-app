import type { NextApiRequest, NextApiResponse } from "next";

// In-memory storage (replace with DB in production)
const storedEvents: TrackerEvent[] = [];

// TrackerEvent type
type TrackerEvent = {
  type: string;
  ts: number;
  url: string;
  title?: string;
  referrer?: string | null;
  siteId?: string;
  sessionId?: string;
  utm?: Record<string, string>;
  customDims?: Record<string, string | number | boolean>;
  payload?: Record<string, unknown>;
  userAgent?: string;
};

// EventBatch type
type EventBatch = {
  siteId: string;
  ts: number;
  events: TrackerEvent[];
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "POST") {
      const batch: EventBatch = req.body;
      console.log(`[Analytics] Received ${batch.events.length} events`);

      // Store events
      storedEvents.push(...batch.events);

      return res.status(200).json({ status: "ok" });
    } else if (req.method === "GET") {
      // Return all stored events
      return res.status(200).json({ events: storedEvents });
    } else {
      return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
