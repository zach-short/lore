import type { LoreData } from "@/lib/lore";

export class DataShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataShapeError";
  }
}

/* Light structural check at the boundary; an *empty* payload is a valid state
   (the UI tells you to run the pipeline), a malformed one is an error. */
export function parseLoreData(raw: unknown): LoreData {
  if (typeof raw !== "object" || raw === null) {
    throw new DataShapeError("data.json is not an object");
  }
  const data = raw as Partial<LoreData>;
  if (!Array.isArray(data.members) || !Array.isArray(data.films)) {
    throw new DataShapeError("data.json is missing members/films arrays");
  }
  if (typeof data.generated_at !== "string") {
    throw new DataShapeError("data.json is missing generated_at");
  }
  return data as LoreData;
}
