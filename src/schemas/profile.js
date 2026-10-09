import { z } from "zod";

export const profileNameSchema = z
  .string()
  .trim()
  .min(3, "validation.profileNameMin")
  .max(50, "validation.profileNameMax");

export const registrationSchema = z.object({
  username: profileNameSchema,
  email: z.string().trim().toLowerCase().email("validation.invalidEmail"),
  password: z.string().min(8, "validation.passwordMin"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "validation.passwordMismatch",
  path: ["confirmPassword"],
});
