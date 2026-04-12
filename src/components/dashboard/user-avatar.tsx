import Image from "next/image";

interface UserAvatarProps {
  name?: string | null;
  image?: string | null;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-16 text-xl",
};

function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserAvatar({ name, image, size = "md" }: UserAvatarProps) {
  const classes = sizeClasses[size];

  if (image) {
    return (
      <Image
        src={image}
        alt={name ?? "User avatar"}
        className={`${classes} rounded-full object-cover ring-2 ring-border`}
      />
    );
  }

  return (
    <div
      className={`${classes} rounded-full bg-secondary text-secondary-foreground
        ring-2 ring-border flex items-center justify-center font-medium shrink-0`}
    >
      {getInitials(name)}
    </div>
  );
}
