import { UserAvatar } from "./user-avatar";
import { LogoutButton } from "./logout-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { User } from "better-auth";
import { Check } from "lucide-react";

interface DashboardViewProps {
  user: User;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between py-4">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value ?? "—"}</span>
    </div>
  );
}

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

export function DashboardView({ user }: DashboardViewProps) {
  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">My account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your personal details and session information.
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Profile Information</CardTitle>
              <CardDescription>
                Your personal identity and contact details.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-5 pb-6">
                <UserAvatar name={user.name} image={user.image} size="lg" />
                <div className="flex flex-col items-start gap-1">
                  <p className="font-semibold text-lg">{user.name}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <div className="mt-1">
                    {user.emailVerified ? (
                      <Badge
                        variant="outline"
                        className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800"
                      >
                        <Check /> Verified
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-800"
                      >
                        Unverified
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="divide-y divide-border">
                <InfoRow label="Full name" value={user.name} />
                <InfoRow label="Email address" value={user.email} />
                <InfoRow
                  label="User ID"
                  value={
                    <code className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                      {user.id}
                    </code>
                  }
                />
                <InfoRow
                  label="Member since"
                  value={user.createdAt ? formatDate(user.createdAt) : null}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Sign out</p>
                <p className="text-sm text-muted-foreground">
                  You will be safely logged out of your account on this device.
                </p>
              </div>
              <LogoutButton />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
