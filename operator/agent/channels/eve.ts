import { eveChannel } from "eve/channels/eve";
import { localDev, type AuthFn } from "eve/channels/auth";
import { verifyOperatorSession } from "../../lib/private-auth.js";

const operatorAuth: AuthFn<Request> = async (request) => {
  const raw = request.headers.get("cookie") ?? "";
  const match = raw.match(/(?:^|;)\s*pcdealhub_operator=([^;]+)/);
  const token = match?.[1] ? decodeURIComponent(match[1]) : undefined;

  if (!verifyOperatorSession(token)) return null;

  return {
    attributes: { role: "owner" },
    authenticator: "operator-cookie",
    issuer: "pcdealhub",
    principalId: "owner",
    principalType: "user",
    subject: "owner",
  };
};

export default eveChannel({
  auth: [operatorAuth, localDev()],
  uploadPolicy: "disabled",
});
