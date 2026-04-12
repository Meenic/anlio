import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your account to continue"
      footer={{
        label: "Don't have an account?",
        linkLabel: "Register",
        href: "/register",
      }}
    >
      <LoginForm />
    </AuthCard>
  );
}
