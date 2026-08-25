import { exchangeAuthorizationCode } from "../../oauth-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return exchangeAuthorizationCode(request);
}
