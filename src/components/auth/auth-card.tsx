import Link from "next/link";

interface AuthCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: {
    label: string;
    linkLabel: string;
    href: string;
  };
}

export function AuthCard({
  title,
  description,
  children,
  footer,
}: AuthCardProps) {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      {children}

      {footer && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {footer.label}{" "}
          <Link href={footer.href} className="text-foreground hover:underline">
            {footer.linkLabel}
          </Link>
        </p>
      )}
    </div>
  );
}
