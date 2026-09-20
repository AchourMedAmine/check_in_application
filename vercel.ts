import { type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  // Supabase lives in aws-1-eu-west-2 (London). Each scan runs several
  // queries, so keeping the functions next to the database matters at a door.
  regions: ["lhr1"],
};
