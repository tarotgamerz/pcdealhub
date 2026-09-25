import type { AuthFn } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { getCookieName, verifySessionCookie } from "../../lib/auth";

function ownerSession(): AuthFn<Request> {
  return async (request) => {
    const token = request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(getCookieName() + "="))
      ?.slice(getCookieName().length + 1);

    if (!(await verifySessionCookie(token))) {
      return null;
    }

    return {
      authenticator: "operator-cookie",
      issuer: "pcdealhub-operator",
      principalId: "owner",
      principalType: "user",
      attributes: {
        name: "PCDealHub Owner",
      },
    };
  };
}

export default eveChannel({
  auth: [ownerSession()],
});