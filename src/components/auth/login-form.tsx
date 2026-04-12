"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";

const loginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);

    await authClient.signIn.email(
      {
        email: values.email,
        password: values.password,
      },
      {
        onSuccess: () => {
          router.push("/");
          router.refresh();
        },
        onError: () => {
          setServerError("Invalid email or password.");
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <FormField
        name="email"
        control={control}
        label="Email"
        inputProps={{
          type: "email",
          placeholder: "you@example.com",
          autoComplete: "email",
        }}
        classNames={{ message: "text-xs" }}
      />

      <FormField
        name="password"
        control={control}
        label="Password"
        inputProps={{
          type: "password",
          placeholder: "••••••••",
          autoComplete: "current-password",
        }}
        classNames={{ message: "text-xs" }}
      />

      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}

      <Button
        type="submit"
        size={"lg"}
        variant={"keycap"}
        disabled={isSubmitting}
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
