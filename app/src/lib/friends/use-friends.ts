import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/lib/data/query-keys";
import { supabase } from "@/lib/supabase";

import type { FriendshipEdge, Profile } from "@/lib/supabase";

/* Both foreign keys point at profiles, so PostgREST needs the constraint
   names to know which embed is which. */
const EDGE_SELECT =
  "id, requester_id, addressee_id, status, created_at, responded_at, " +
  "requester:profiles!friendships_requester_id_fkey(*), " +
  "addressee:profiles!friendships_addressee_id_fkey(*)";

export type FriendsState = {
  /** accepted friends' profiles */
  friends: Profile[];
  /** accepted-edge id per friend profile id (unfriend needs the edge) */
  edgeIdByFriendId: Record<string, string>;
  /** pending edges someone sent me */
  incoming: FriendshipEdge[];
  /** pending edges I sent */
  outgoing: FriendshipEdge[];
  /** every profile id I already have an edge with (any status) */
  linkedIds: Set<string>;
};

/** The signed-in member's friend graph, both directions, derived in one read. */
export function useFriends() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  return useQuery({
    queryKey: queryKeys.friends.edges(userId ?? "anonymous"),
    enabled: userId !== null,
    queryFn: async (): Promise<FriendsState> => {
      const { data, error } = await supabase
        .from("friendships")
        .select(EDGE_SELECT)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      const edges = (data ?? []) as unknown as FriendshipEdge[];
      const state: FriendsState = {
        friends: [],
        edgeIdByFriendId: {},
        incoming: [],
        outgoing: [],
        linkedIds: new Set(),
      };
      for (const edge of edges) {
        const other =
          edge.requester_id === userId ? edge.addressee : edge.requester;
        state.linkedIds.add(other.id);
        if (edge.status === "accepted") {
          state.friends.push(other);
          state.edgeIdByFriendId[other.id] = edge.id;
        } else if (edge.addressee_id === userId) {
          state.incoming.push(edge);
        } else {
          state.outgoing.push(edge);
        }
      }
      return state;
    },
  });
}

/** Search the roster by Letterboxd handle or display name; self excluded. */
export function useFriendSearch(term: string) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  /* Commas and parens would splice into the .or() filter syntax. */
  const clean = term.trim().replace(/[,()]/g, "");
  return useQuery({
    queryKey: queryKeys.friends.search(userId ?? "anonymous", clean),
    enabled: userId !== null && clean.length >= 2,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .or(
          `letterboxd_username.ilike.%${clean}%,display_name.ilike.%${clean}%`,
        )
        .neq("id", userId)
        .limit(8);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** Request / accept / remove, all invalidating the one edges query. */
export function useFriendActions() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? null;
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });

  const request = useMutation({
    mutationFn: async (addresseeId: string) => {
      if (!userId) throw new Error("Not signed in.");
      const { error } = await supabase.from("friendships").insert({
        requester_id: userId,
        addressee_id: addresseeId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  const accept = useMutation({
    mutationFn: async (edgeId: string) => {
      const { error } = await supabase
        .from("friendships")
        .update({
          status: "accepted",
          responded_at: new Date().toISOString(),
        })
        .eq("id", edgeId);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  /* Decline, cancel, and unfriend are all the same delete. */
  const remove = useMutation({
    mutationFn: async (edgeId: string) => {
      const { error } = await supabase
        .from("friendships")
        .delete()
        .eq("id", edgeId);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return { request, accept, remove };
}
