import { redirect } from "next/navigation";
import { roomRedirectQuery } from "@/lib/lounge/chips";

/*
 * Rooms no longer exist as destinations — the unified feed's chips
 * replaced them (spec 2026-07-05). This route survives purely so old
 * links, shares, and notifications keep resolving.
 */
export const runtime = "edge";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function LoungeRoomRedirect({ params }: Props) {
  const { slug } = await params;
  redirect(`/lounge${roomRedirectQuery(slug)}`);
}
