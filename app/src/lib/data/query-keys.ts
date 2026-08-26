/* Every key starts with its domain root so domain-wide invalidation works. */
export const queryKeys = {
  lore: {
    all: ["lore"] as const,
    data: ["lore", "data"] as const,
  },
  auth: {
    all: ["auth"] as const,
    profile: (userId: string) => ["auth", "profile", userId] as const,
  },
  friends: {
    all: ["friends"] as const,
    edges: (userId: string) => ["friends", "edges", userId] as const,
    search: (userId: string, term: string) =>
      ["friends", "search", userId, term] as const,
  },
};
