// GET /api/my-items -> { userId, items }   (401 when signed out)
// PUT /api/my-items { items } -> { userId, items }
// My Items for the signed-in account. The browser keeps a local copy and syncs through here.

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { listUserItems, MAX_USER_ITEMS, replaceUserItems } from "@/lib/repo/user-items";

const Item = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(200),
  brand: z.string().trim().min(1).max(200).optional(),
  addedAt: z.iso.datetime({ offset: true }),
});
const Body = z.object({ items: z.array(Item).max(MAX_USER_ITEMS) }).strict();

const noStore = { "Cache-Control": "no-store" };
const signedOut = () => Response.json({ error: "Sign in to save your items." }, { status: 401, headers: noStore });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return signedOut();
  return Response.json({ userId: user.id, items: await listUserItems(user.id) }, { headers: noStore });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return signedOut();
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Invalid item list." }, { status: 400 });
  const items = await replaceUserItems(user.id, parsed.data.items);
  return Response.json({ userId: user.id, items }, { headers: noStore });
}
