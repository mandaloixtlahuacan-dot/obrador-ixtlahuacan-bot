import { describe, expect, it } from "vitest";
import { calcularPorcion } from "@/lib/carne";
import { ofrecerCita, reabastoPendiente, vacunasParaAvisar } from "@/lib/citas";
import { loadNegocio } from "@/lib/config";
import { guiaAlimento, mensajeForrajera, mensajeSinPromo } from "@/lib/forrajera";
import { formatPrecioGanado } from "@/lib/ganado";
import { handleWebhook } from "@/lib/webhookHandler";
import { loadDailyPrices } from "@/lib/sniim";
import type { PrecioGanado } from "@/lib/types";
import { makeDeps, webhookRequest } from "./helpers";

const now = new Date("2026-11-09T16:00:00.000Z");

describe("datos vacíos, respuesta segura", () => {
  it("no inventa kilos ni precio si no hay porción", () => {
    const r = calcularPorcion("tacos", 80, loadNegocio(), now);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.respuesta).toMatch(/alguien del equipo/i);
      expect(r.respuesta).not.toMatch(/\$\s?\d/);
      expect(r.respuesta).toMatch(/10 kg/);
    }
  });

  it("con porción redondea hacia arriba y respeta el mínimo de 10", () => {
    const cfg = {
      ...loadNegocio(),
      porcion_kg_por_persona: { tacos: 0.15 },
      precio_kg: [],
    };
    const ochenta = calcularPorcion("tacos", 80, cfg, now);
    expect(ochenta.ok).toBe(true);
    if (ochenta.ok) {
      expect(ochenta.kilos).toBe(12);
      expect(ochenta.total).toBeNull();
      expect(ochenta.respuesta).not.toMatch(/\$\d/);
      expect(ochenta.respuesta).toMatch(/confirma el Obrador/);
    }
    const pocos = calcularPorcion("tacos", 2, cfg, now);
    expect(pocos.ok && pocos.kilos).toBe(10);
  });

  it("el total de referencia solo sale de un precio vigente", () => {
    const base = {
      ...loadNegocio(),
      porcion_kg_por_persona: { tacos: 0.15 },
    };
    const vigente = calcularPorcion("tacos", 80, {
      ...base,
      precio_kg: [
        {
          producto: "tacos",
          precio: 180,
          vigente_desde: "2026-01-01",
          vigente_hasta: "2026-12-31",
          actualizado_por: "Obrador",
        },
      ],
    }, now);
    expect(vigente.ok && vigente.total).toBe(2160);
    if (vigente.ok) expect(vigente.respuesta).toMatch(/referencia/);

    const viejo = calcularPorcion("tacos", 80, {
      ...base,
      precio_kg: [
        { producto: "tacos", precio: 180, vigente_hasta: "2020-01-01" },
      ],
    }, now);
    expect(viejo.ok && viejo.total).toBeNull();
  });

  it("precio de ganado solo si hay fila, y pollo no se inventa", () => {
    expect(formatPrecioGanado("becerro", [])).toMatch(/no tengo precio confiable/i);
    expect(formatPrecioGanado("becerro", [])).not.toMatch(/\$\d/);
    expect(formatPrecioGanado("pollo", [])).toMatch(/pollo/);
    const row: PrecioGanado = {
      id: "p1",
      animal: "bovino",
      presentacion: "pie",
      destino: "1544",
      destinoNombre: "rastro de Guadalajara",
      precioMin: 48,
      precioMax: 52,
      unidad: "kg",
      fecha: "2026-11-08",
      fuente: "SNIIM",
    };
    const texto = formatPrecioGanado("becerro", [row]);
    expect(texto).toContain("$48–$52");
    expect(texto).toContain("SNIIM");
    expect(texto).toContain("2026-11-08");
  });

  it("forrajera, ración, cita y promo vacías no inventan", () => {
    const cfg = loadNegocio();
    const forrajera = mensajeForrajera(cfg);
    expect(forrajera).toContain("https://maps.google.com/?q=20.874329,-103.232947");
    expect(forrajera).toMatch(/alguien del equipo/i);
    expect(forrajera).not.toMatch(/\d{1,2}:\d{2}/);
    expect(guiaAlimento("chivas", "engordar", [])).toMatch(/no quiero inventarte/i);
    expect(ofrecerCita(now, "obrador", cfg).ok).toBe(false);
    expect(mensajeSinPromo()).toMatch(/no tengo una promo/i);
    expect(vacunasParaAvisar([], now, null)).toEqual([]);
    expect(reabastoPendiente("maíz", "2026-01-01", {}, now)).toBe(false);
  });

  it("el webhook contesta seguro sin llamar a OpenAI", async () => {
    const { deps, sent, completions } = makeDeps();
    await handleWebhook(webhookRequest({
      messages: [
        {
          id: "precio-1",
          from_me: false,
          chat_id: "5215551112233@s.whatsapp.net",
          from: "5215551112233@s.whatsapp.net",
          type: "text",
          text: { body: "¿Cuál es el precio de hoy del becerro?" },
        },
      ],
    }), deps);
    expect(completions.n).toBe(0);
    expect(sent[0].body).toMatch(/no tengo precio confiable/i);
    expect(sent[0].body).not.toMatch(/\$\d/);
  });

  it("SNIIM no carga ni inventa precios", async () => {
    const result = await loadDailyPrices();
    expect(result).toEqual({ loaded: 0, reason: "not_enabled" });
    expect(JSON.stringify(result)).not.toMatch(/precio/i);
  });
});
