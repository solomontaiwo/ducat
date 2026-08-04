import { z } from "zod";

export const profileNameSchema = z
  .string()
  .trim()
  .min(3, "Il nome profilo deve contenere almeno 3 caratteri")
  .max(50, "Il nome profilo non può superare 50 caratteri");

export const registrationSchema = z.object({
  username: profileNameSchema,
  email: z.string().trim().toLowerCase().email("Email non valida"),
  password: z.string().min(8, "La password deve contenere almeno 8 caratteri"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Le password non coincidono",
  path: ["confirmPassword"],
});
