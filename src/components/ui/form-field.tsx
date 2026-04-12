import {
  Field,
  FieldLabel,
  FieldError,
  FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type ComponentProps, type ReactNode, useId } from "react";
import {
  Controller,
  type Control,
  type ControllerRenderProps,
  type FieldValues,
  type Path,
} from "react-hook-form";

type FormFieldRenderProps<T extends FieldValues> = {
  field: ControllerRenderProps<T, Path<T>>;
  error?: string;
  id: string;
  ariaDescribedBy?: string;
};

interface FormFieldBaseProps<T extends FieldValues> {
  name: Path<T>;
  control: Control<T>;
  label?: string;
  description?: string;
  hideDescriptionOnError?: boolean;
  id?: string;
  classNames?: {
    wrapper?: string;
    label?: string;
    input?: string;
    description?: string;
    message?: string;
  };
}

type FormFieldProps<T extends FieldValues> = FormFieldBaseProps<T> &
  (
    | {
        children: (props: FormFieldRenderProps<T>) => ReactNode;
        inputProps?: never;
      }
    | {
        children?: never;
        inputProps?: Omit<
          ComponentProps<typeof Input>,
          "name" | "id" | "value" | "onChange" | "onBlur"
        > & {
          onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
          onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
        };
      }
  );

function buildAriaDescribedBy(
  ids: Array<string | undefined>,
): string | undefined {
  return ids.filter(Boolean).join(" ") || undefined;
}

export function FormField<T extends FieldValues>({
  name,
  control,
  label,
  description,
  hideDescriptionOnError = false,
  id: externalId,
  classNames,
  inputProps,
  children,
}: FormFieldProps<T>) {
  const generatedId = useId();
  const inputId = externalId ?? generatedId;
  const descriptionId = `${inputId}-description`;
  const errorId = `${inputId}-error`;

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState: { error } }) => {
        const showDescription =
          description && !(hideDescriptionOnError && error);

        const ariaDescribedBy = buildAriaDescribedBy([
          showDescription ? descriptionId : undefined,
          error ? errorId : undefined,
        ]);

        return (
          <Field data-invalid={!!error} className={classNames?.wrapper}>
            {label && (
              <FieldLabel htmlFor={inputId} className={classNames?.label}>
                {label}
              </FieldLabel>
            )}

            {children ? (
              children({
                field,
                error: error?.message,
                id: inputId,
                ariaDescribedBy,
              })
            ) : (
              <Input
                id={inputId}
                className={classNames?.input}
                aria-invalid={!!error}
                aria-describedby={ariaDescribedBy}
                {...inputProps}
                {...field}
                value={field.value ?? ""}
                onChange={(e) => {
                  field.onChange(e);
                  inputProps?.onChange?.(e);
                }}
                onBlur={(e) => {
                  field.onBlur();
                  inputProps?.onBlur?.(e);
                }}
              />
            )}

            {showDescription && (
              <FieldDescription
                id={descriptionId}
                className={classNames?.description}
              >
                {description}
              </FieldDescription>
            )}

            {error && (
              <FieldError id={errorId} className={classNames?.message}>
                {error.message}
              </FieldError>
            )}
          </Field>
        );
      }}
    />
  );
}
