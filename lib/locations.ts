import {
  FORRAJERA_MAPS,
  FORRAJERA_NOMBRE,
  OBRADOR_MAPS,
  OBRADOR_NOMBRE,
} from "@/lib/config";

const OBRADOR_Q = "20.8552464,-103.2460428";
const FORRAJERA_Q = "20.874329,-103.232947";

export const LOCATION_REPLY =
  "¡Gracias! Con tu pueblo me basta; el encargado te confirma los detalles.";

/** Drop a customer pin. The two business links stay. */
export function redactCustomerLocation(text: string): string {
  if (!text) return text;
  let out = text.replace(
    /https?:\/\/(?:maps\.google\.com\/\?q=|www\.google\.com\/maps[^\s]*|maps\.app\.goo\.gl\/)[^\s)]+/gi,
    (full) => {
      if (full.includes(OBRADOR_Q) || full.includes(FORRAJERA_Q)) return full;
      return "(ubicación del cliente no se guarda)";
    },
  );
  out = out.replace(
    /lat(?:itud)?\s*[:=]\s*-?\d+(?:\.\d+)?\s*,?\s*l(?:ng|on|ongitud)\s*[:=]\s*-?\d+(?:\.\d+)?/gi,
    "(ubicación del cliente no se guarda)",
  );
  return out;
}

export function mensajeObrador(): string {
  return `El ${OBRADOR_NOMBRE} está aquí: ${OBRADOR_MAPS}`;
}

export function mensajeForrajeraLugar(
  horario: string,
  telefono: string,
): string {
  const partes = [
    `${FORRAJERA_NOMBRE}, Ixtlahuacán del Río: ${FORRAJERA_MAPS}`,
  ];
  if (horario.trim() && telefono.trim()) {
    partes.push(`Horario: ${horario.trim()}. Tel: ${telefono.trim()}.`);
  } else if (horario.trim()) {
    partes.push(`Horario: ${horario.trim()}.`);
    partes.push("El teléfono te lo confirma alguien del equipo.");
  } else if (telefono.trim()) {
    partes.push(`Tel: ${telefono.trim()}.`);
    partes.push("El horario te lo confirma alguien del equipo.");
  } else {
    partes.push("El horario y el teléfono te los confirma alguien del equipo.");
  }
  return partes.join(" ");
}

export function esLinkNuestro(url: string): boolean {
  return url.includes(OBRADOR_Q) || url.includes(FORRAJERA_Q);
}
