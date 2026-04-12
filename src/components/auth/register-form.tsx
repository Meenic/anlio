"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";

const registerSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setServerError(null);

    await authClient.signUp.email(
      {
        name: values.name,
        email: values.email,
        password: values.password,
      },
      {
        onSuccess: () => {
          router.push("/");
          router.refresh();
        },
        onError: (ctx) => {
          setServerError(
            ctx.error.message ?? "Something went wrong. Please try again.",
          );
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <FormField
        name="name"
        control={control}
        label="Name"
        inputProps={{
          type: "text",
          placeholder: "John Doe",
          autoComplete: "name",
        }}
        classNames={{ message: "text-xs" }}
      />

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
          autoComplete: "new-password",
        }}
        classNames={{ message: "text-xs" }}
      />

      <FormField
        name="confirmPassword"
        control={control}
        label="Confirm Password"
        inputProps={{
          type: "password",
          placeholder: "••••••••",
          autoComplete: "new-password",
        }}
        classNames={{ message: "text-xs" }}
      />

      {serverError && (
        <p role="alert" className="text-sm text-center text-destructive">
          {serverError}
        </p>
      )}

      <Button
        type="submit"
        size={"lg"}
        variant={"keycap"}
        disabled={isSubmitting}
      >
        {isSubmitting ? "Creating account..." : "Register"}
      </Button>
    </form>
  );
}
