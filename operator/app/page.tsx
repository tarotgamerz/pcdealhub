import { redirect } from "next/navigation";
import { hasOperatorSession } from "../lib/private-auth";
import { OperatorConsole } from "./operator-console";

export default async function Page() {
  if (!(await hasOperatorSession())) {
    redirect("/login");
  }

  return <OperatorConsole />;
}
