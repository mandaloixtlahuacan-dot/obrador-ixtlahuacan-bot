import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { interpretChannelHealth } from "@/lib/channel";
import { healthInfo } from "@/lib/healthInfo";
import { runReminders } from "@/lib/broadcast/daily";
import { citasParaRecordar } from "@/lib/citas";
import { loadNegocio } from "@/lib/config";
import { makeDeps } from "./helpers";

describe("salud y base", () => {
  it("sin variables de Supabase reporta memoria y base desconectada", async () => {
    const info = await healthInfo();
    expect(info.ok).toBe(true);
    expect(info.broadcasts_enabled).toBe(false);
    expect(info.database).toEqual({
      configured: false,
      connected: false,
      mode: "memory",
    });
    expect(JSON.stringify(info)).not.toContain("test-whapi");
    expect(JSON.stringify(info)).not.toContain("test-openai");
  });

  it("el canal AUTH está sano y QR no", () => {
    expect(interpretChannelHealth({ status: { code: 4, text: "AUTH" } }).ok).toBe(true);
    expect(interpretChannelHealth({ status: { code: 3, text: "QR" } })).toEqual({
      ok: false,
      status: "QR",
    });
  });

  it("los recordatorios no salen si el interruptor o la hora están vacíos", async () => {
    const { deps, sent } = makeDeps();
    expect(await runReminders(deps)).toMatchObject({ sent: 0, reason: "disabled" });
    expect(sent).toHaveLength(0);
    expect(citasParaRecordar([], new Date(), loadNegocio().recordatorio_vispera_hora)).toEqual([]);
    expect(loadNegocio().recordatorio_vispera_hora).toBeNull();
  });

  it("la migración deja el schema obrador con RLS y sin acceso anon", () => {
    const sql = readFileSync(
      "supabase/migrations/20261109160000_obrador_schema.sql",
      "utf8",
    );
    expect(sql).toMatch(/create schema if not exists obrador/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/force row level security/i);
    expect(sql).toMatch(/revoke all on table obrador\.%I from public, anon, authenticated/i);
    expect(sql).not.toMatch(/grant\s+[^;]*\sto\s+anon/i);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toMatch(/precios_ganado/);
    expect(sql).toMatch(/create table obrador.inventario_ganado/i);
    expect(sql).toMatch(/create table obrador.intereses_ganado/i);
    expect(sql).not.toMatch(/precio_promo/);
    expect(sql).not.toMatch(/latitud|longitud/i);
  });
});
