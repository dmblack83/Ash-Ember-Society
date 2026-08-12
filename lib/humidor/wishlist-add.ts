import { createClient } from "@/utils/supabase/client";
import { mutate } from "swr";
import { keyFor } from "@/lib/data/keys";

/* Adds a cigar to the wishlist. The humidor_items_wishlist_unique
   partial index makes duplicates a 23505 conflict, which we report as
   "exists" rather than an error. Revalidates the wishlist SWR keys. */
export async function addCigarToWishlist(
  userId:  string,
  cigarId: string,
): Promise<"added" | "exists"> {
  const supabase = createClient();
  const { error } = await supabase
    .from("humidor_items")
    .insert({ user_id: userId, cigar_id: cigarId, quantity: 1, is_wishlist: true });

  if (error && error.code !== "23505") throw new Error(error.message);
  void mutate(keyFor.wishlist(userId));
  void mutate(keyFor.hasWishlist(userId));
  void mutate(keyFor.cigarWishlisted(userId, cigarId));
  return error ? "exists" : "added";
}
