import { redirect } from "next/navigation";
import { hasOperatorSession } from "../lib/private-auth.js";
import { OperatorConsole } from "./operator-console.js";

export default async function Page() {
  if (!(await hasOperatorSession())) {
    redirect("/login");
  }

  return <OperatorConsole />;
}
