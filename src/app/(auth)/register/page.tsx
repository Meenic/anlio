import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create an account"
      description="Sign up to get started"
      footer={{
        label: "Already have an account?",
        linkLabel: "Sign in",
        href: "/login",
      }}
    >
      <RegisterForm />
    </AuthCard>
  );
}
