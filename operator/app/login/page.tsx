import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="eyebrow">PCDealHub · Private Operator</div>
        <h1>Your AI workspace.</h1>
        <p>This console is private. Sign in to control the autonomous PCDealHub Operator.</p>
        <LoginForm />
      </section>
    </main>
  );
}