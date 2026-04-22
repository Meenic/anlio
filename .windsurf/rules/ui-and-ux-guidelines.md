---
trigger: always_on
---

# UI & UX Guidelines

**Core Stack**: [Tailwind CSS v4](https://tailwindcss.com) & [shadcn/ui](https://ui.shadcn.com).

## 1. Styling & Theming

- **No Hardcoded Colors**: NEVER use hex codes (e.g., `#ffffff`) or arbitrary rgb values.
  - **Bad**: `bg-[#1a1a1a]`, `text-gray-500`
  - **Good**: `bg-background`, `text-muted-foreground`, `border-border`
- **Use Global Variables**: Rely on the variables defined in `src/app/globals.css`. These ensure Dark Mode works automatically.
  - `bg-card` / `text-card-foreground` for containers.
  - `bg-primary` / `text-primary-foreground` for main actions.
  - `bg-destructive` for errors/deletes.

## 2. Component Usage

- **shadcn/ui First**: Check if a component exists in `src/components/ui` before building from scratch.
  - **Default Styles**: Most shadcn/ui components apply global color variables automatically. You often DO NOT need to add utility classes for colors (e.g., `<Card>` naturally uses `bg-card`).
- **Buttons**:
  - DO NOT override button styles manually (e.g., `className="bg-red-500 rounded-md"`).
  - Use `variant`: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`.
  - Use `size`: `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`.
  - **Icons**: Shadcn buttons handle icon sizing and spacing automatically. Just drop the icon in.
    ```tsx
    <Button>
      <Mail /> Login with Email
    </Button>
    ```
