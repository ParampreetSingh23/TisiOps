import { z } from "zod";

const byosProvider = z.enum(["AWS", "AZURE", "EXCLOUD", "GCP"]);

const sshFields = z
  .object({
    provider: byosProvider,
    host: z
      .string()
      .trim()
      .min(1, "Public IP address or hostname is required")
      .max(253),
    sshPort: z.coerce.number().int().min(1).max(65535).default(22),
    sshUsername: z.string().trim().min(1, "SSH username is required").max(64),
    authType: z.enum(["key", "password"]),
    privateKey: z
      .string()
      .min(1, "SSH private key is required")
      .max(32768)
      .optional(),
    passphrase: z.string().max(1024).optional(),
    password: z
      .string()
      .min(1, "SSH password is required")
      .max(4096)
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.authType === "key" && !value.privateKey?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["privateKey"],
        message: "SSH private key is required",
      });
    }
    if (value.authType === "password" && !value.password) {
      context.addIssue({
        code: "custom",
        path: ["password"],
        message: "SSH password is required",
      });
    }
  });

/** SSH test accepts credentials but never stores them. */
export const serverConnectionTestSchema = sshFields;

/** A BYOS server can only be one of the providers supported by this wizard. */
export const createBYOSServerSchema = sshFields.extend({
  name: z.string().trim().max(100).optional(),
  osType: z.string().trim().min(1).max(80).default("Ubuntu"),
});
