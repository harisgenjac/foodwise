// Field name → i18n key of its error; a field without an entry is valid. Forms show them with
// hooks/useFormValidation.
export type FieldErrors<F extends string = string> = Partial<Record<F, string>>;

export const REQUIRED = "common.fieldRequired";

// The required check shared by the forms: empty or only spaces.
export const isBlank = (value: string) => value.trim() === "";
