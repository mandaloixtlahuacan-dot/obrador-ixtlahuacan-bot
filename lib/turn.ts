import { detectarPersonas, calcularPorcion, respuestaPrecioCarne } from "@/lib/carne";
import { ofrecerCita } from "@/lib/citas";
import {
  adminPhone,
  encargadoNombre,
  loadNegocio,
} from "@/lib/config";
import { esNo, esSi, type Command } from "@/lib/commands";
import { anotarBienvenida, resumenFicha } from "@/lib/crm";
import type { Deps } from "@/lib/deps";
import {
  guiaAlimento,
  mensajeDosis,
  mensajeForrajera,
  mensajePromo,
  mensajeSinPromo,
  promosVigentes,
} from "@/lib/forrajera";
import { formatPrecioGanado, formatTelefono } from "@/lib/ganado";
import { mensajeObrador } from "@/lib/locations";
import { advancePueblo, PUEBLO_PASO_1 } from "@/lib/pueblo";
import { fold } from "@/lib/text";
import { dentroDeHorarioObrador, textoLlamadaManana } from "@/lib/time";
import { permisoVencido } from "@/lib/tools";
import type { Cliente, Session } from "@/lib/types";
import { toMexicoWhatsappJid } from "@/lib/mexicoJid";

export function esAdmin(chatId: string): boolean {
  try {
    return toMexicoWhatsappJid(chatId) === toMexicoWhatsappJid(adminPhone());
  } catch {
    return false;
  }
}

function animalDePregunta(text: string): string | null {
  const t = fold(text);
  if (/becerro|vaca|toro|bovino|res en pie|\bres\b/.test(t)) return /becerro/.test(t) ? "becerro" : "res";
  if (/puerco|cerdo|porcino/.test(t)) return "puerco";
  if (/borrego|oveja|ovino/.test(t)) return "borrego";
  if (/chiva|cabra|caprino/.test(t)) return "chiva";
  if (/huevo/.test(t)) return "huevo";
  if (/pollo|gallina/.test(t)) return "pollo";
  if (/caballo|yegua/.test(t)) return "caballo";
  return null;
}

export function esPreguntaPrecioGanado(text: string): boolean {
  const t = fold(text);
  if (/cotiz|carne para|kilo de carne|precio de la carne/.test(t)) return false;
  if (/precio de hoy|precio del dia|precio del ganado|en pie|sniim/.test(t)) return true;
  return /cuanto (anda|esta|vale).*(becerro|vaca|toro|puerco|cerdo|borrego|chiva|cabra|huevo|pollo|caballo)/.test(
    t,
  );
}

export function esPreguntaPrecioCarne(text: string): boolean {
  const t = fold(text);
  if (esPreguntaPrecioGanado(text)) return false;
  return /cuanto cuesta|precio del kilo|precio de la carne|a como (esta|sale)/.test(t);
}

export async function replyCommand(opts: {
  command: Command;
  chatId: string;
  cliente: Cliente;
  session: Session;
  deps: Deps;
}): Promise<string | null> {
  const { command, cliente, session, deps, chatId } = opts;
  const now = deps.now();
  const cfg = loadNegocio();

  if ((command.type === "pausar" || command.type === "seguir") && !esAdmin(chatId)) {
    return null;
  }
  if (command.type === "pausar") {
    const brake = await deps.store.getBrake();
    await deps.store.setBrake({ ...brake, activo: true, motivo: "manual" });
    return "Listo. Pausé los avisos. No se reanudan solos: cuando quieras, dime #avisos seguir.";
  }
  if (command.type === "seguir") {
    const brake = await deps.store.getBrake();
    await deps.store.setBrake({
      ...brake,
      activo: false,
      motivo: null,
      failStreak: 0,
    });
    return "Va. Los avisos pueden seguir, dentro del horario y los topes.";
  }
  if (command.type === "opt_out") {
    cliente.recibeAvisos = false;
    cliente.recibeAvisosCambio = now.toISOString();
    return "Listo, ya no te mando avisos. Si más adelante quieres, dime 'quiero avisos'.";
  }
  if (command.type === "opt_in") {
    cliente.recibeAvisos = true;
    cliente.recibeAvisosCambio = now.toISOString();
    cliente.fueraDeLista = false;
    cliente.soloResumenSemanal = false;
    return "Va, te vuelvo a incluir en los avisos. Cuando quieras salir, dime 'ya no'.";
  }
  if (command.type === "borrar") {
    await deps.store.deleteCliente(chatId);
    await deps.store.clearHistory(chatId);
    return "Listo, borré tus datos. Si escribes de nuevo, empezamos de cero.";
  }
  if (command.type === "persona") {
    const quien = encargadoNombre(cfg);
    await deps.sendText(
      adminPhone(),
      [
        "👤 Piden una persona",
        `Chat: ${chatId}`,
        `Nombre: ${cliente.nombre || "—"}`,
        `Número: ${cliente.telefono || "—"}`,
        `Pueblo: ${cliente.pueblo || "—"}`,
      ].join("\n"),
    );
    let reply = `Ya le avisé a ${quien}, te escribe en un momento.`;
    if (!dentroDeHorarioObrador(now)) {
      reply += ` La llamada te la hacen ${textoLlamadaManana(now, cfg.hora_llamada || "7:00")}.`;
    }
    session.misunderstood = 0;
    return reply;
  }
  if (command.type === "ficha") return resumenFicha(cliente);
  if (command.type === "no_compartir") {
    cliente.comparteNumeroGeneral = "no";
    cliente.comparteNumeroEn = now.toISOString();
    for (const v of cliente.ventas) v.comparteNumero = false;
    return "Va, ya no comparto tu número. Si alguien pregunta, le digo que te escriba aquí.";
  }
  if (command.type === "no_entiendo") {
    session.misunderstood += 1;
    if (session.misunderstood >= 2) {
      return "Para no hacerte batallar, ¿te comunico con alguien del Obrador? Contéstame 'persona'.";
    }
    return "Perdón, se me fue. ¿Buscas carne o es algo de tus animales?";
  }
  if (command.type === "saludo") {
    if (cliente.nombre) {
      if (session.topic) {
        return `¡Qué gusto, ${cliente.nombre}! ¿Seguimos con ${session.topic} o empezamos con otra cosa?`;
      }
      return `¡Qué gusto, ${cliente.nombre}! ¿Lo de siempre o algo nuevo?`;
    }
    return "¡Hola! ¿Cómo estás? 👋 Soy del Obrador Ixtlahuacán. ¿En qué te ayudamos? ¿Buscas carne o es algo de tus animales?";
  }
  if (command.type === "menu") {
    session.topic = null;
    return "Claro. ¿Buscas carne o es algo de tus animales?";
  }
  return null;
}

export async function replyPending(opts: {
  text: string;
  cliente: Cliente;
  session: Session;
  deps: Deps;
}): Promise<string | null> {
  const pending = opts.session.pending;
  if (!pending) return null;
  if (pending.kind === "pueblo") {
    const step = advancePueblo(pending.step, opts.text);
    if (step.done) {
      opts.cliente.pueblo = step.done.pueblo;
      opts.cliente.zona = step.done.zona;
      opts.session.pending = null;
      return `Anotado: ${step.done.pueblo}. ${pending.resume === "la venta" ? "¿A nombre de quién, y te parece si lo anuncio con tu número?" : "Seguimos."}`;
    }
    opts.session.pending = { ...pending, step: step.next || pending.step };
    return step.ask || PUEBLO_PASO_1;
  }
  if (pending.kind === "permiso_numero") {
    const cfg = loadNegocio();
    if (
      permisoVencido(pending.pedidoEn, opts.deps.now(), cfg.horas_sin_respuesta_permiso) &&
      !esSi(opts.text) &&
      !esNo(opts.text)
    ) {
      return null;
    }
    if (!esSi(opts.text) && !esNo(opts.text)) return null;
    const venta = opts.cliente.ventas.find((v) => v.id === pending.ventaId);
    opts.session.pending = null;
    if (esSi(opts.text) && venta) {
      venta.comparteNumero = true;
      opts.cliente.comparteNumeroGeneral = "si";
      opts.cliente.comparteNumeroEn = opts.deps.now().toISOString();
      const tel = formatTelefono(opts.cliente.telefono);
      const nombre = opts.cliente.nombre || "El ganadero";
      const pueblo = venta.pueblo || opts.cliente.pueblo || "la zona";
      if (tel) {
        await opts.deps.sendText(
          pending.interesadoChatId,
          `Hay un ganadero con ${pending.raza}: ${nombre}, en ${pueblo}. Su número es ${tel}. Dile que vienes del Obrador.`,
        );
      }
      return "Listo, ya le pasé tu número. Gracias.";
    }
    await opts.deps.sendText(
      pending.interesadoChatId,
      "Por ahora no está disponible; te aviso si sale otro.",
    );
    return "Va, no comparto tu número. Yo le aviso al interesado.";
  }
  return null;
}

export async function replySafe(text: string, deps: Deps): Promise<string | null> {
  const cfg = loadNegocio();
  const now = deps.now();
  const t = fold(text);

  const personas = detectarPersonas(text);
  if (personas) {
    return calcularPorcion(personas.platillo, personas.personas, cfg, now).respuesta;
  }
  if (esPreguntaPrecioGanado(text)) {
    const animal = animalDePregunta(text);
    if (!animal) return "¿De qué animal?";
    const rows = await deps.store.listPreciosGanado();
    return formatPrecioGanado(animal, rows);
  }
  if (esPreguntaPrecioCarne(text)) {
    return `${respuestaPrecioCarne()} ¿Qué te hace falta?`;
  }
  if (/forrajera|corral de piedra/.test(t)) return mensajeForrajera(cfg);
  if (/donde (estan|queda)|ubicacion|como llego/.test(t) && /obrador|ustedes|estan/.test(t)) {
    return mensajeObrador();
  }
  if (/dosis|cuanto le doy|formula/.test(t)) return mensajeDosis();
  if (/racion|que le doy de comer|alimento para/.test(t)) {
    const para = /chiva|borrego|vaca|becerro|puerco|caballo|pollo/.exec(t)?.[0] || "tus animales";
    const objetivo = /engord/.test(t) ? "engordar" : /manten/.test(t) ? "mantener" : "";
    return guiaAlimento(para, objetivo, cfg.guias_racion);
  }
  if (/promo|oferta|en oferta/.test(t)) {
    const rows = promosVigentes(await deps.store.listPromosForrajera(), now);
    return rows.length ? mensajePromo(rows[0]) : mensajeSinPromo();
  }
  if (/apartar|pesar|una cita|apartame/.test(t)) {
    const offered = ofrecerCita(null, /forrajera/.test(t) ? "forrajera" : "obrador", cfg);
    if (!offered.ok) return offered.respuesta;
  }
  return null;
}

export function withWelcome(reply: string, cliente: Cliente, taskDone: boolean): string {
  if (!taskDone) return reply;
  return anotarBienvenida(reply, cliente);
}
