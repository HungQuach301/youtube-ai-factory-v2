import { exchangeOAuthToken } from "../../oauth-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return exchangeOAuthToken(request);
}
