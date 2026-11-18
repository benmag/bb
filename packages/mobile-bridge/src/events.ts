import { z } from "zod";
import { bridgeServersSchema, safeAreaInsetsSchema } from "./handshake.js";

const bridgeResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), result: z.unknown() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

const voiceDictationBatchesSchema = z.array(z.string().max(20_000)).max(500);

export const shellToPageEventSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("safe-area"), safeArea: safeAreaInsetsSchema })
    .strict(),
  z.object({ type: z.literal("resume") }).strict(),
  z
    .object({ type: z.literal("servers"), servers: bridgeServersSchema })
    .strict(),
  z
    .object({
      type: z.literal("response"),
      id: z.string().min(1).max(64),
      response: bridgeResponseSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("voice-dictation-partial"),
      batches: voiceDictationBatchesSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("voice-dictation-ended"),
      reason: z.enum(["stopped", "cancelled", "error", "system"]),
      batches: voiceDictationBatchesSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("voice-dictation-level"),
      amplitude: z.number().min(0).max(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("composer-dictation-keyboard-text"),
      text: z.string().max(100_000),
      selectionStart: z.number().int().min(0).max(100_000).optional(),
      selectionEnd: z.number().int().min(0).max(100_000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("composer-dictation-keyboard-layout"),
      bottomInset: z.number().min(0).max(10_000),
    })
    .strict(),
  z
    .object({
      type: z.literal("composer-dictation-commit"),
      text: z.string().max(100_000),
      action: z.enum(["insert", "discard"]),
    })
    .strict(),
]);

export type ShellToPageEvent = z.infer<typeof shellToPageEventSchema>;
export type BridgeResponse = z.infer<typeof bridgeResponseSchema>;

export function parseShellToPageEvent(value: unknown): ShellToPageEvent | null {
  const parsed = shellToPageEventSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
