import { calcularPorcion } from "@/lib/carne";
import { adminPhone, loadNegocio } from "@/lib/config";
import { especieDe, newId, recomputeEtiquetas } from "@/lib/crm";
import type { Deps } from "@/lib/deps";
import { mensajeDosis, mensajeForrajera, mensajePromo, mensajeSinPromo, guiaAlimento, promosVigentes } from "@/lib/forrajera";
import { formatPrecioGanado } from "@/lib/ganado";
import { textoInventarioPublico } from "@/lib/inventario";
import { notifyAdminLead } from "@/lib/notifyLead";
import { ofrecerCita } from "@/lib/citas";
import { mensajeObrador } from "@/lib/locations";
import { PUEBLO_PASO_1 } from "@/lib/pueblo";
import type { Store } from "@/lib/store/types";
import type { Cliente, InventarioGanado, Session } from "@/lib/types";
import { loadBroadcastConfig } from "@/lib/broadcast/policy";
import { planInventarioNotices } from "@/lib/broadcast/plan";
import type { LeadArgs } from "@/lib/lead";

export const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "enviar_pedido_a_admin",
      description:
        "Envía el pedido de carne (o una actualización) al administrador del obrador por WhatsApp. Llamar solo con producto, kilos y si pasa o se lo llevan a la cabecera. No incluyas ubicación, pin ni dirección del cliente.",
      parameters: {
        type: "object",
        properties: {
          nombre_contacto: { type: "string" },
          nombre_negocio: { type: "string" },
          productos: { type: "string" },
          entrega_o_recoge: {
            type: "string",
            description: "recoge en el Obrador | entrega en cabecera",
          },
          dia_horario: { type: "string" },
          notas: { type: "string" },
          resumen: { type: "string" },
          es_actualizacion: { type: "boolean" },
        },
        required: ["productos", "resumen"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "guardar_cliente",
      description:
        "Anota en la ficha solo lo que la persona ya dijo: nombre, pueblo, zona, negocio, animales. No inventes.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          pueblo: { type: "string" },
          zona: { type: "string", enum: ["municipio", "cerca", "lejos"] },
          negocio: { type: "string" },
          tipo_negocio: { type: "string" },
          animales: {
            type: "string",
            description: "Como lo dijo, ej. 30 chivas pelibuey",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "calcular_porcion",
      description:
        "Kilos para un número de personas. Usa la respuesta tal cual. Si no hay porción cargada, no calcules tú.",
      parameters: {
        type: "object",
        properties: {
          platillo: { type: "string" },
          personas: { type: "number" },
        },
        required: ["platillo", "personas"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "consultar_precio_ganado",
      description: "Precio del día desde la tabla. Nunca inventes un número.",
      parameters: {
        type: "object",
        properties: { animal: { type: "string" } },
        required: ["animal"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "registrar_venta",
      description:
        "Anota ganado en el inventario central. No pidas ni guardes permiso para compartir el número. No pongas precio.",
      parameters: {
        type: "object",
        properties: {
          animal: { type: "string" },
          raza: { type: "string" },
          tipo: { type: "string" },
          cantidad: { type: "number" },
          peso_edad: { type: "string" },
          nombre: { type: "string" },
        },
        required: ["animal"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "buscar_ganado",
      description:
        "Lista el inventario activo. Nunca incluyas nombre, número ni dato que identifique al ganadero. No inventes precios.",
      parameters: {
        type: "object",
        properties: { raza: { type: "string" } },
        required: ["raza"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "consultar_forrajera",
      description: "Ubicación, horario y teléfono de la forrajera, solo si están cargados.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "consultar_promos",
      description: "Promos vigentes de la forrajera. Si no hay, no inventes.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "guia_alimento",
      description: "Guía de ración solo si está cargada. Nunca inventes una fórmula.",
      parameters: {
        type: "object",
        properties: {
          animales: { type: "string" },
          objetivo: { type: "string", description: "engordar o mantener" },
        },
        required: ["animales"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apartar_cita",
      description:
        "Ofrece horas solo del horario cargado, en el Obrador o la forrajera. Si no hay horario, usa la respuesta tal cual.",
      parameters: {
        type: "object",
        properties: {
          lugar: { type: "string", enum: ["obrador", "forrajera"] },
          dia: { type: "string", description: "YYYY-MM-DD" },
          hora: { type: "string" },
          motivo: { type: "string" },
        },
        required: ["motivo"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "programar_vacuna",
      description:
        "Guarda el recordatorio con la fecha que dijo la persona o su veterinario. Si no hay fecha, no la inventes.",
      parameters: {
        type: "object",
        properties: {
          animal: { type: "string" },
          vacuna: { type: "string" },
          proxima: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["animal"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "pedir_pueblo",
      description: "Cuando haga falta el pueblo y no lo sabes. Devuelve el texto exacto a enviar.",
      parameters: { type: "object", properties: { resume: { type: "string" } } },
    },
  },
];

export type ToolCtx = {
  chatId: string;
  fromNumber: string | null;
  cliente: Cliente;
  session: Session;
  deps: Deps;
  taskDone: boolean;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function executeTool(
  name: string,
  rawArgs: string,
  ctx: ToolCtx,
): Promise<Record<string, unknown>> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
  } catch {
    args = {};
  }
  const cfg = loadNegocio();
  const now = ctx.deps.now();

  if (name === "enviar_pedido_a_admin") {
    const lead: LeadArgs = {
      nombre_contacto: str(args.nombre_contacto) || ctx.cliente.nombre || undefined,
      nombre_negocio: str(args.nombre_negocio) || ctx.cliente.negocio || undefined,
      productos: str(args.productos),
      entrega_o_recoge: str(args.entrega_o_recoge),
      dia_horario: str(args.dia_horario),
      notas: str(args.notas),
      resumen: str(args.resumen),
      es_actualizacion: Boolean(args.es_actualizacion),
    };
    const result = await notifyAdminLead({
      chatId: ctx.chatId,
      fromNumber: ctx.fromNumber || ctx.cliente.telefono,
      args: lead,
      store: ctx.deps.store,
      sendText: ctx.deps.sendText,
    });
    if (result.ok && !result.skipped) {
      ctx.taskDone = true;
      if (lead.nombre_contacto) ctx.cliente.nombre = lead.nombre_contacto;
      if (lead.nombre_negocio) {
        ctx.cliente.negocio = lead.nombre_negocio;
        ctx.cliente.tipoNegocio = lead.nombre_negocio;
      }
      if (lead.productos) ctx.cliente.productosInteres = lead.productos;
      ctx.cliente.pedidos.push({
        id: newId(),
        chatId: ctx.chatId,
        productos: lead.productos || "",
        negocio: lead.nombre_negocio || null,
        entrega: lead.entrega_o_recoge || "",
        createdAt: now.toISOString(),
      });
      if (ctx.cliente.pedidos.length >= 2) {
        ctx.cliente.kilosHabituales = lead.productos || ctx.cliente.kilosHabituales;
        ctx.cliente.frecuencia = "recurrente";
      }
      ctx.session.topic = "el pedido de carne";
      recomputeEtiquetas(ctx.cliente);
    }
    return result;
  }

  if (name === "guardar_cliente") {
    if (str(args.nombre)) ctx.cliente.nombre = str(args.nombre);
    if (str(args.pueblo)) ctx.cliente.pueblo = str(args.pueblo);
    const zona = str(args.zona);
    if (zona === "municipio" || zona === "cerca" || zona === "lejos") {
      ctx.cliente.zona = zona;
    }
    if (str(args.negocio)) ctx.cliente.negocio = str(args.negocio);
    if (str(args.tipo_negocio)) ctx.cliente.tipoNegocio = str(args.tipo_negocio);
    if (str(args.animales)) {
      ctx.cliente.animales.push({
        id: newId(),
        especie: especieDe(str(args.animales)),
        razaTipo: str(args.animales),
        cantidad: null,
        pesoEdad: null,
      });
    }
    recomputeEtiquetas(ctx.cliente);
    return { ok: true };
  }

  if (name === "calcular_porcion") {
    const r = calcularPorcion(str(args.platillo), Number(args.personas), cfg, now);
    return { ...r };
  }

  if (name === "consultar_precio_ganado") {
    const rows = await ctx.deps.store.listPreciosGanado();
    return { respuesta: formatPrecioGanado(str(args.animal) || "ese animal", rows) };
  }

  if (name === "consultar_forrajera") {
    return { respuesta: mensajeForrajera(cfg) };
  }

  if (name === "consultar_promos") {
    const rows = promosVigentes(await ctx.deps.store.listPromosForrajera(), now);
    if (!rows.length) return { respuesta: mensajeSinPromo() };
    return { respuesta: mensajePromo(rows[0]) };
  }

  if (name === "guia_alimento") {
    return {
      respuesta: guiaAlimento(str(args.animales), str(args.objetivo), cfg.guias_racion),
    };
  }

  if (name === "pedir_pueblo") {
    ctx.session.pending = {
      kind: "pueblo",
      step: "origen",
      resume: str(args.resume) || "seguimos",
    };
    return { respuesta: PUEBLO_PASO_1 };
  }

  if (name === "programar_vacuna") {
    const proxima = str(args.proxima);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(proxima)) {
      return {
        respuesta:
          "¿De qué animales, y cuándo te dijo tu veterinario que toca la próxima? La fecha la pones tú; yo no la calculo.",
      };
    }
    ctx.cliente.vacunas.push({
      id: newId(),
      chatId: ctx.chatId,
      animal: str(args.animal),
      vacuna: str(args.vacuna) || null,
      fechaAplicada: null,
      proxima,
      avisado: false,
    });
    recomputeEtiquetas(ctx.cliente);
    return { respuesta: "Va, te aviso unos días antes." };
  }

  if (name === "apartar_cita") {
    const lugar = str(args.lugar) === "forrajera" ? "forrajera" : "obrador";
    const dia = str(args.dia);
    const hora = str(args.hora);
    const motivo = str(args.motivo) || "tu cita";
    if (!cfg.horarios_cita.length) {
      return {
        respuesta:
          "Para apartarte la hora me falta el horario del equipo. Alguien te confirma el día. ¿Te comunico con la persona encargada?",
      };
    }
    if (!dia || !hora) {
      const offered = ofrecerCita(dia ? new Date(`${dia}T12:00:00-06:00`) : null, lugar, cfg);
      return { respuesta: offered.respuesta };
    }
    const offered = ofrecerCita(new Date(`${dia}T12:00:00-06:00`), lugar, cfg);
    if (!offered.ok || !offered.horas.includes(hora)) {
      return { respuesta: offered.respuesta };
    }
    ctx.cliente.citas.push({
      id: newId(),
      chatId: ctx.chatId,
      lugar,
      motivo,
      dia,
      hora,
      estado: "apartada",
      recordatorioEnviado: false,
      createdAt: now.toISOString(),
    });
    ctx.taskDone = true;
    const donde = lugar === "forrajera" ? "la forrajera" : "el Obrador";
    const link = lugar === "forrajera" ? cfg.ubicaciones.forrajera.maps : mensajeObrador();
    await ctx.deps.sendText(
      adminPhone(),
      `📅 Cita apartada\nChat: ${ctx.chatId}\n${ctx.cliente.nombre || "sin nombre"}\n${dia} ${hora} en ${donde}\n${motivo}`,
    );
    return {
      respuesta: `Listo, te aparté el ${dia} a las ${hora} en ${donde}. En un ratito te confirmo. ${link}`,
    };
  }

  if (name === "registrar_venta") {
    return registrarVenta(args, ctx, cfg);
  }

  if (name === "buscar_ganado") {
    return buscar(str(args.raza), ctx);
  }

  if (name === "dosis") {
    return { respuesta: mensajeDosis() };
  }

  return { ok: false, error: `unknown_tool:${name}` };
}

async function registrarVenta(
  args: Record<string, unknown>,
  ctx: ToolCtx,
  _cfg: ReturnType<typeof loadNegocio>,
): Promise<Record<string, unknown>> {
  const animal = str(args.animal);
  if (!animal) return { respuesta: "¿Qué animales y cuántos?" };
  if (str(args.nombre)) ctx.cliente.nombre = str(args.nombre);
  if (!ctx.cliente.pueblo) {
    ctx.session.pending = { kind: "pueblo", step: "origen", resume: "la publicación" };
    return { respuesta: PUEBLO_PASO_1, need_pueblo: true };
  }
  const item: InventarioGanado = {
    id: newId(),
    chatId: ctx.chatId,
    publicadorNombre: ctx.cliente.nombre,
    publicadorTelefono: ctx.cliente.telefono,
    especie: especieDe(`${animal} ${str(args.raza)} ${str(args.tipo)}`),
    tipo: str(args.tipo),
    raza: str(args.raza),
    cantidad: Number.isFinite(Number(args.cantidad)) ? Number(args.cantidad) : null,
    pueblo: ctx.cliente.pueblo,
    notas: str(args.peso_edad) || null,
    fecha: ctx.deps.now().toISOString().slice(0, 10),
    estado: "activa",
    createdAt: ctx.deps.now().toISOString(),
  };
  await ctx.deps.store.saveCliente(ctx.cliente);
  await ctx.deps.store.saveInventario(item);
  ctx.cliente.animales.push({
    id: newId(),
    especie: item.especie,
    razaTipo: [item.tipo, item.raza].filter(Boolean).join(" ") || animal,
    cantidad: item.cantidad,
    pesoEdad: str(args.peso_edad) || null,
  });
  recomputeEtiquetas(ctx.cliente);
  ctx.session.topic = "el ganado anotado";
  ctx.taskDone = true;
  const bcfg = loadBroadcastConfig();
  if (bcfg.enabled) {
    const todos = await ctx.deps.store.listClientes();
    const notices = planInventarioNotices({
      item,
      clientes: todos,
      cfg: bcfg,
      now: ctx.deps.now(),
    });
    if (notices.length) await ctx.deps.store.enqueue(notices);
  }
  const cant = item.cantidad != null ? `${item.cantidad} ` : "";
  return {
    respuesta: `Quedó anotado: ${cant}${[item.tipo, item.raza].filter(Boolean).join(" ") || item.especie} en ${item.pueblo}. No paso tu número. Si alguien se interesa, alguien del equipo los contacta.`,
    id: item.id,
    broadcasts_enabled: bcfg.enabled,
  };
}

async function buscar(raza: string, ctx: ToolCtx): Promise<Record<string, unknown>> {
  if (!raza) return { respuesta: "¿Qué buscas? Por ejemplo vacas gordas o becerros." };
  ctx.cliente.busquedas.push({
    id: newId(),
    chatId: ctx.chatId,
    especie: especieDe(raza),
    razaTipo: raza,
    createdAt: ctx.deps.now().toISOString(),
    activa: true,
  });
  recomputeEtiquetas(ctx.cliente);
  const items = await ctx.deps.store.listInventario();
  return { respuesta: textoInventarioPublico(items, raza) };
}

export async function marcarVentaVendida(
  cliente: Cliente,
  texto: string,
  store?: Store,
): Promise<boolean> {
  const t = texto.toLowerCase();
  if (!/vendi|ya se vend|ya no las tengo|ya las vendi/.test(t)) return false;
  let changed = false;
  for (const v of cliente.ventas) {
    if (v.estado === "activa") {
      v.estado = "vendida";
      changed = true;
    }
  }
  if (store) {
    const items = await store.listInventario();
    for (const item of items) {
      if (item.chatId === cliente.chatId && item.estado === "activa") {
        item.estado = "vendida";
        await store.saveInventario(item);
        changed = true;
      }
    }
  }
  return changed;
}

