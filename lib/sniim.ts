/**
 * Daily livestock prices. This module never fetches and never invents a number.
 * The intended source, once Víctor approves it, is SNIIM Pecuarios:
 * rastro Guadalajara destino 1544, with Zapopan 1402 and Tlaquepaque 1545
 * as backup, for bovino, porcino, ovino and caprino (en pie y en canal) plus huevo.
 * Pollo and caballo have no Guadalajara quote.
 * Rows land in obrador.precios_ganado. Until a loader is switched on, the table stays empty.
 */
export const SNIIM_SOURCE = {
  primario: { destino: "1544", nombre: "rastro de Guadalajara" },
  respaldo: [
    { destino: "1402", nombre: "Zapopan" },
    { destino: "1545", nombre: "Tlaquepaque" },
  ],
  especies: ["bovino", "porcino", "ovino", "caprino", "huevo"],
} as const;

export async function loadDailyPrices(): Promise<{ loaded: number; reason: string }> {
  return { loaded: 0, reason: "not_enabled" };
}
