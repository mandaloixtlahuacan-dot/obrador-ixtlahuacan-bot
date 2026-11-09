import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { newSession } from "@/lib/crm";
import type { Store } from "@/lib/store/types";
import type {
  Animal,
  Brake,
  Busqueda,
  Campana,
  Cita,
  Cliente,
  CompraForrajera,
  LeadFlags,
  PedidoCarne,
  PrecioGanado,
  PromoForrajera,
  QueueItem,
  SendLog,
  Session,
  StoredMessage,
  Vacuna,
  Venta,
  Zona,
} from "@/lib/types";

type Row = Record<string, unknown>;

function maxHistory(): number {
  const n = Number.parseInt(process.env.MAX_HISTORY || "24", 10);
  return Number.isFinite(n) && n > 0 ? n : 24;
}

function must<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data as T;
}

type ObradorClient = SupabaseClient<any, any, "obrador">;

export class SupabaseStore implements Store {
  readonly mode = "supabase" as const;
  private db: ObradorClient;

  constructor() {
    const url = process.env.SUPABASE_URL?.trim() || "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
    this.db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "obrador" },
    });
  }

  async ping(): Promise<boolean> {
    const { error } = await this.db.from("clientes").select("chat_id").limit(1);
    return !error;
  }

  async getCliente(chatId: string): Promise<Cliente | null> {
    const { data, error } = await this.db
      .from("clientes")
      .select("*")
      .eq("chat_id", chatId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return this.hydrate(data as Row);
  }

  async saveCliente(cliente: Cliente): Promise<void> {
    const row = {
      chat_id: cliente.chatId,
      telefono: cliente.telefono,
      nombre: cliente.nombre,
      pueblo: cliente.pueblo,
      zona: cliente.zona,
      negocio: cliente.negocio,
      tipo_negocio: cliente.tipoNegocio,
      etiquetas: cliente.etiquetas,
      recibe_avisos: cliente.recibeAvisos,
      recibe_avisos_cambio: cliente.recibeAvisosCambio,
      comparte_numero_general: cliente.comparteNumeroGeneral,
      comparte_numero_en: cliente.comparteNumeroEn,
      kilos_habituales: cliente.kilosHabituales,
      frecuencia: cliente.frecuencia,
      productos_interes: cliente.productosInteres,
      notas_encargado: cliente.notasEncargado,
      aviso_bienvenida_enviado: cliente.avisoBienvenidaEnviado,
      ultima_conversacion: cliente.ultimaConversacion,
      sin_respuesta_avisos: cliente.sinRespuestaAvisos,
      solo_resumen_semanal: cliente.soloResumenSemanal,
      fuera_de_lista: cliente.fueraDeLista,
      updated_at: new Date().toISOString(),
    };
    must(null, (await this.db.from("clientes").upsert(row)).error);
    await this.replaceChildren(cliente);
  }

  async deleteCliente(chatId: string): Promise<void> {
    must(null, (await this.db.from("clientes").delete().eq("chat_id", chatId)).error);
    must(null, (await this.db.from("lead_flags").delete().eq("chat_id", chatId)).error);
    must(null, (await this.db.from("mensajes").delete().eq("chat_id", chatId)).error);
    must(null, (await this.db.from("envios_log").delete().eq("chat_id", chatId)).error);
    must(
      null,
      (await this.db.from("cola_envios").delete().eq("chat_id", chatId)).error,
    );
  }

  async listClientes(): Promise<Cliente[]> {
    const { data, error } = await this.db.from("clientes").select("*");
    if (error) throw new Error(error.message);
    const rows = (data || []) as Row[];
    const out: Cliente[] = [];
    for (const row of rows) out.push(await this.hydrate(row));
    return out;
  }

  async getSession(chatId: string): Promise<Session> {
    const { data, error } = await this.db
      .from("sesiones")
      .select("*")
      .eq("chat_id", chatId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return newSession(chatId);
    const row = data as Row;
    return {
      chatId,
      pending: (row.pending as Session["pending"]) ?? null,
      misunderstood: Number(row.misunderstood || 0),
      topic: (row.topic as string) ?? null,
      updatedAt: (row.updated_at as string) ?? null,
    };
  }

  async saveSession(session: Session): Promise<void> {
    must(
      null,
      (
        await this.db.from("sesiones").upsert({
          chat_id: session.chatId,
          pending: session.pending,
          misunderstood: session.misunderstood,
          topic: session.topic,
          updated_at: new Date().toISOString(),
        })
      ).error,
    );
  }

  async getHistory(chatId: string): Promise<StoredMessage[]> {
    const max = maxHistory();
    const { data, error } = await this.db
      .from("mensajes")
      .select("payload")
      .eq("chat_id", chatId)
      .order("id", { ascending: false })
      .limit(max);
    if (error) throw new Error(error.message);
    const rows = ((data || []) as Row[]).reverse();
    return rows.map((r) => r.payload as StoredMessage);
  }

  async appendMessages(chatId: string, msgs: StoredMessage[]): Promise<void> {
    if (!msgs.length) return;
    const rows = msgs.map((m) => ({ chat_id: chatId, payload: m }));
    must(null, (await this.db.from("mensajes").insert(rows)).error);
  }

  async clearHistory(chatId: string): Promise<void> {
    must(null, (await this.db.from("mensajes").delete().eq("chat_id", chatId)).error);
  }

  async getLead(chatId: string): Promise<LeadFlags> {
    const { data, error } = await this.db
      .from("lead_flags")
      .select("*")
      .eq("chat_id", chatId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { sent: false, updated: false };
    const row = data as Row;
    return { sent: Boolean(row.sent), updated: Boolean(row.updated) };
  }

  async saveLead(chatId: string, lead: LeadFlags): Promise<void> {
    must(
      null,
      (
        await this.db.from("lead_flags").upsert({
          chat_id: chatId,
          sent: lead.sent,
          updated: lead.updated,
        })
      ).error,
    );
  }

  async markSeen(messageId: string): Promise<boolean> {
    if (!messageId) return true;
    const { error } = await this.db
      .from("mensajes_vistos")
      .insert({ message_id: messageId });
    if (!error) return true;
    if (error.code === "23505" || /duplicate/i.test(error.message)) return false;
    throw new Error(error.message);
  }

  async listPreciosGanado(): Promise<PrecioGanado[]> {
    const { data, error } = await this.db
      .from("precios_ganado")
      .select("*")
      .order("fecha", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data || []) as Row[]).map((r) => ({
      id: String(r.id),
      animal: String(r.animal),
      presentacion: String(r.presentacion),
      destino: String(r.destino),
      destinoNombre: (r.destino_nombre as string) ?? null,
      precioMin: r.precio_min == null ? null : Number(r.precio_min),
      precioMax: r.precio_max == null ? null : Number(r.precio_max),
      unidad: String(r.unidad || "kg"),
      fecha: String(r.fecha),
      fuente: String(r.fuente),
    }));
  }

  async listPromosForrajera(): Promise<PromoForrajera[]> {
    const { data, error } = await this.db.from("promos_forrajera").select("*");
    if (error) throw new Error(error.message);
    return ((data || []) as Row[]).map((r) => ({
      id: String(r.id),
      producto: String(r.producto),
      presentacion: (r.presentacion as string) ?? null,
      precioPromo: Number(r.precio_promo),
      precioNormal: r.precio_normal == null ? null : Number(r.precio_normal),
      vigenteHasta: String(r.vigente_hasta),
      cargadaPor: (r.cargada_por as string) ?? null,
    }));
  }

  async getBrake(): Promise<Brake> {
    const { data, error } = await this.db.from("freno").select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return { activo: false, motivo: null, failStreak: 0, holdUntil: null };
    }
    const row = data as Row;
    return {
      activo: Boolean(row.activo),
      motivo: (row.motivo as string) ?? null,
      failStreak: Number(row.fail_streak || 0),
      holdUntil: (row.hold_until as string) ?? null,
    };
  }

  async setBrake(brake: Brake): Promise<void> {
    must(
      null,
      (
        await this.db.from("freno").upsert({
          id: 1,
          activo: brake.activo,
          motivo: brake.motivo,
          fail_streak: brake.failStreak,
          hold_until: brake.holdUntil,
          updated_at: new Date().toISOString(),
        })
      ).error,
    );
  }

  async enqueue(items: QueueItem[]): Promise<void> {
    if (!items.length) return;
    const rows = items.map(queueToRow);
    must(null, (await this.db.from("cola_envios").insert(rows)).error);
  }

  async nextQueueItem(nowIso: string): Promise<QueueItem | null> {
    const { data, error } = await this.db
      .from("cola_envios")
      .select("*")
      .eq("status", "pending")
      .lte("not_before", nowIso)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw new Error(error.message);
    const row = (data || [])[0] as Row | undefined;
    return row ? queueFromRow(row) : null;
  }

  async saveQueueItem(item: QueueItem): Promise<void> {
    must(null, (await this.db.from("cola_envios").upsert(queueToRow(item))).error);
  }

  async cancelQueueByPromo(promoId: string): Promise<number> {
    const { data, error } = await this.db
      .from("cola_envios")
      .update({ status: "cancelled" })
      .eq("promo_id", promoId)
      .eq("status", "pending")
      .select("id");
    if (error) throw new Error(error.message);
    return (data || []).length;
  }

  async countSent(sinceIso: string, untilIso: string): Promise<number> {
    return this.countLogs(sinceIso, untilIso, "sent");
  }

  async countSentFor(chatId: string, sinceIso: string, untilIso: string): Promise<number> {
    const { count, error } = await this.db
      .from("envios_log")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", chatId)
      .eq("status", "sent")
      .gte("created_at", sinceIso)
      .lt("created_at", untilIso);
    if (error) throw new Error(error.message);
    return count || 0;
  }

  async countByStatus(sinceIso: string, untilIso: string, status: string): Promise<number> {
    return this.countLogs(sinceIso, untilIso, status);
  }

  async logSend(entry: SendLog): Promise<void> {
    must(
      null,
      (
        await this.db.from("envios_log").insert({
          id: entry.id,
          chat_id: entry.chatId,
          tipo: entry.tipo,
          status: entry.status,
          created_at: entry.createdAt,
        })
      ).error,
    );
  }

  async saveCampana(c: Campana): Promise<void> {
    must(
      null,
      (
        await this.db.from("campanas_promo").upsert({
          id: c.id,
          grupo: c.grupo,
          texto: c.texto,
          texto_final: c.textoFinal,
          destinatarios: c.destinatarios,
          tiempo_estimado_min: c.tiempoEstimadoMin,
          status: c.status,
          created_at: c.createdAt,
          expires_at: c.expiresAt,
          used: c.used,
        })
      ).error,
    );
  }

  async getCampana(id: string): Promise<Campana | null> {
    const { data, error } = await this.db
      .from("campanas_promo")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const r = data as Row;
    return {
      id: String(r.id),
      grupo: r.grupo as Campana["grupo"],
      texto: String(r.texto),
      textoFinal: String(r.texto_final),
      destinatarios: Number(r.destinatarios),
      tiempoEstimadoMin: Number(r.tiempo_estimado_min),
      status: r.status as Campana["status"],
      createdAt: String(r.created_at),
      expiresAt: String(r.expires_at),
      used: Boolean(r.used),
    };
  }

  private async countLogs(sinceIso: string, untilIso: string, status: string): Promise<number> {
    const { count, error } = await this.db
      .from("envios_log")
      .select("id", { count: "exact", head: true })
      .eq("status", status)
      .gte("created_at", sinceIso)
      .lt("created_at", untilIso);
    if (error) throw new Error(error.message);
    return count || 0;
  }

  private async replaceChildren(cliente: Cliente): Promise<void> {
    const chatId = cliente.chatId;
    for (const table of [
      "animales",
      "ventas",
      "busquedas",
      "pedidos_carne",
      "vacunas",
      "citas",
      "compras_forrajera",
    ]) {
      must(null, (await this.db.from(table).delete().eq("chat_id", chatId)).error);
    }
    if (cliente.animales.length) {
      must(
        null,
        (
          await this.db.from("animales").insert(
            cliente.animales.map((a: Animal) => ({
              id: a.id,
              chat_id: chatId,
              especie: a.especie,
              raza_tipo: a.razaTipo,
              cantidad: a.cantidad,
              peso_edad: a.pesoEdad,
            })),
          )
        ).error,
      );
    }
    if (cliente.ventas.length) {
      must(
        null,
        (
          await this.db.from("ventas").insert(
            cliente.ventas.map((v: Venta) => ({
              id: v.id,
              chat_id: chatId,
              especie: v.especie,
              raza_tipo: v.razaTipo,
              cantidad: v.cantidad,
              peso_edad: v.pesoEdad,
              pueblo: v.pueblo,
              comparte_numero: v.comparteNumero,
              estado: v.estado,
              created_at: v.createdAt,
            })),
          )
        ).error,
      );
    }
    if (cliente.busquedas.length) {
      must(
        null,
        (
          await this.db.from("busquedas").insert(
            cliente.busquedas.map((b: Busqueda) => ({
              id: b.id,
              chat_id: chatId,
              especie: b.especie,
              raza_tipo: b.razaTipo,
              activa: b.activa,
              created_at: b.createdAt,
            })),
          )
        ).error,
      );
    }
    if (cliente.pedidos.length) {
      must(
        null,
        (
          await this.db.from("pedidos_carne").insert(
            cliente.pedidos.map((p: PedidoCarne) => ({
              id: p.id,
              chat_id: chatId,
              productos: p.productos,
              negocio: p.negocio,
              entrega: p.entrega,
              created_at: p.createdAt,
            })),
          )
        ).error,
      );
    }
    if (cliente.vacunas.length) {
      must(
        null,
        (
          await this.db.from("vacunas").insert(
            cliente.vacunas.map((v: Vacuna) => ({
              id: v.id,
              chat_id: chatId,
              animal: v.animal,
              vacuna: v.vacuna,
              fecha_aplicada: v.fechaAplicada,
              proxima: v.proxima,
              avisado: v.avisado,
            })),
          )
        ).error,
      );
    }
    if (cliente.citas.length) {
      must(
        null,
        (
          await this.db.from("citas").insert(
            cliente.citas.map((c: Cita) => ({
              id: c.id,
              chat_id: chatId,
              lugar: c.lugar,
              motivo: c.motivo,
              dia: c.dia,
              hora: c.hora,
              estado: c.estado,
              recordatorio_enviado: c.recordatorioEnviado,
              created_at: c.createdAt,
            })),
          )
        ).error,
      );
    }
    if (cliente.comprasForrajera.length) {
      must(
        null,
        (
          await this.db.from("compras_forrajera").insert(
            cliente.comprasForrajera.map((c: CompraForrajera) => ({
              id: c.id,
              chat_id: chatId,
              producto: c.producto,
              fecha: c.fecha,
            })),
          )
        ).error,
      );
    }
  }

  private async hydrate(row: Row): Promise<Cliente> {
    const chatId = String(row.chat_id);
    const [animales, ventas, busquedas, pedidos, vacunas, citas, compras] =
      await Promise.all([
        this.child("animales", chatId),
        this.child("ventas", chatId),
        this.child("busquedas", chatId),
        this.child("pedidos_carne", chatId),
        this.child("vacunas", chatId),
        this.child("citas", chatId),
        this.child("compras_forrajera", chatId),
      ]);
    return {
      chatId,
      telefono: (row.telefono as string) ?? null,
      nombre: (row.nombre as string) ?? null,
      pueblo: (row.pueblo as string) ?? null,
      zona: (row.zona as Zona) ?? null,
      negocio: (row.negocio as string) ?? null,
      tipoNegocio: (row.tipo_negocio as string) ?? null,
      etiquetas: (row.etiquetas as string[]) ?? [],
      recibeAvisos: row.recibe_avisos !== false,
      recibeAvisosCambio: (row.recibe_avisos_cambio as string) ?? null,
      comparteNumeroGeneral:
        (row.comparte_numero_general as Cliente["comparteNumeroGeneral"]) ||
        "sin_preguntar",
      comparteNumeroEn: (row.comparte_numero_en as string) ?? null,
      kilosHabituales: (row.kilos_habituales as string) ?? null,
      frecuencia: (row.frecuencia as string) ?? null,
      productosInteres: (row.productos_interes as string) ?? null,
      notasEncargado: (row.notas_encargado as string) ?? null,
      avisoBienvenidaEnviado: Boolean(row.aviso_bienvenida_enviado),
      ultimaConversacion: (row.ultima_conversacion as string) ?? null,
      sinRespuestaAvisos: Number(row.sin_respuesta_avisos || 0),
      soloResumenSemanal: Boolean(row.solo_resumen_semanal),
      fueraDeLista: Boolean(row.fuera_de_lista),
      animales: animales.map((a) => ({
        id: String(a.id),
        especie: String(a.especie),
        razaTipo: String(a.raza_tipo || ""),
        cantidad: a.cantidad == null ? null : Number(a.cantidad),
        pesoEdad: (a.peso_edad as string) ?? null,
      })),
      ventas: ventas.map((v) => ({
        id: String(v.id),
        chatId,
        especie: String(v.especie),
        razaTipo: String(v.raza_tipo || ""),
        cantidad: v.cantidad == null ? null : Number(v.cantidad),
        pesoEdad: (v.peso_edad as string) ?? null,
        pueblo: (v.pueblo as string) ?? null,
        comparteNumero: Boolean(v.comparte_numero),
        estado: v.estado as Venta["estado"],
        createdAt: String(v.created_at),
      })),
      busquedas: busquedas.map((b) => ({
        id: String(b.id),
        chatId,
        especie: String(b.especie),
        razaTipo: String(b.raza_tipo || ""),
        createdAt: String(b.created_at),
        activa: Boolean(b.activa),
      })),
      pedidos: pedidos.map((p) => ({
        id: String(p.id),
        chatId,
        productos: String(p.productos || ""),
        negocio: (p.negocio as string) ?? null,
        entrega: String(p.entrega || ""),
        createdAt: String(p.created_at),
      })),
      vacunas: vacunas.map((v) => ({
        id: String(v.id),
        chatId,
        animal: String(v.animal),
        vacuna: (v.vacuna as string) ?? null,
        fechaAplicada: (v.fecha_aplicada as string) ?? null,
        proxima: (v.proxima as string) ?? null,
        avisado: Boolean(v.avisado),
      })),
      citas: citas.map((c) => ({
        id: String(c.id),
        chatId,
        lugar: c.lugar as Cita["lugar"],
        motivo: String(c.motivo || ""),
        dia: String(c.dia),
        hora: String(c.hora),
        estado: c.estado as Cita["estado"],
        recordatorioEnviado: Boolean(c.recordatorio_enviado),
        createdAt: String(c.created_at),
      })),
      comprasForrajera: compras.map((c) => ({
        id: String(c.id),
        producto: String(c.producto),
        fecha: String(c.fecha),
      })),
    };
  }

  private async child(table: string, chatId: string): Promise<Row[]> {
    const { data, error } = await this.db.from(table).select("*").eq("chat_id", chatId);
    if (error) throw new Error(error.message);
    return (data || []) as Row[];
  }
}

function queueToRow(item: QueueItem): Row {
  return {
    id: item.id,
    tipo: item.tipo,
    chat_id: item.chatId,
    cuerpo: item.cuerpo,
    promo_id: item.promoId,
    priority: item.priority,
    status: item.status,
    not_before: item.notBefore,
    attempts: item.attempts,
    last_error: item.lastError,
    created_at: item.createdAt,
    sent_at: item.sentAt,
  };
}

function queueFromRow(r: Row): QueueItem {
  return {
    id: String(r.id),
    tipo: r.tipo as QueueItem["tipo"],
    chatId: String(r.chat_id),
    cuerpo: String(r.cuerpo),
    promoId: (r.promo_id as string) ?? null,
    priority: Number(r.priority || 0),
    status: r.status as QueueItem["status"],
    notBefore: String(r.not_before),
    attempts: Number(r.attempts || 0),
    lastError: (r.last_error as string) ?? null,
    createdAt: String(r.created_at),
    sentAt: (r.sent_at as string) ?? null,
  };
}
