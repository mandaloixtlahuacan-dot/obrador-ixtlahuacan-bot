import type { Store } from "@/lib/store/types";
import { newSession } from "@/lib/crm";
import type {
  Brake,
  Campana,
  Cliente,
  InteresGanado,
  InventarioGanado,
  LeadFlags,
  PrecioGanado,
  PromoForrajera,
  QueueItem,
  SendLog,
  Session,
  StoredMessage,
} from "@/lib/types";

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SEEN = 5000;

function maxHistory(): number {
  const n = Number.parseInt(process.env.MAX_HISTORY || "24", 10);
  return Number.isFinite(n) && n > 0 ? n : 24;
}

const emptyBrake = (): Brake => ({
  activo: false,
  motivo: null,
  failStreak: 0,
  holdUntil: null,
});

export class MemoryStore implements Store {
  readonly mode = "memory" as const;
  clientes = new Map<string, Cliente>();
  sessions = new Map<string, Session>();
  history = new Map<string, StoredMessage[]>();
  leads = new Map<string, LeadFlags>();
  seen = new Map<string, number>();
  precios: PrecioGanado[] = [];
  promos: PromoForrajera[] = [];
  brake: Brake = emptyBrake();
  queue: QueueItem[] = [];
  logs: SendLog[] = [];
  campanas = new Map<string, Campana>();
  inventario: InventarioGanado[] = [];
  intereses: InteresGanado[] = [];

  async ping(): Promise<boolean> {
    return false;
  }

  async getCliente(chatId: string): Promise<Cliente | null> {
    const c = this.clientes.get(chatId);
    return c ? structuredClone(c) : null;
  }

  async saveCliente(cliente: Cliente): Promise<void> {
    this.clientes.set(cliente.chatId, structuredClone(cliente));
  }

  async deleteCliente(chatId: string): Promise<void> {
    this.clientes.delete(chatId);
    this.sessions.delete(chatId);
    this.history.delete(chatId);
    this.leads.delete(chatId);
    this.queue = this.queue.filter((q) => q.chatId !== chatId);
    this.logs = this.logs.filter((l) => l.chatId !== chatId);
    const publicados = new Set(
      this.inventario.filter((i) => i.chatId === chatId).map((i) => i.id),
    );
    this.inventario = this.inventario.filter((i) => i.chatId !== chatId);
    this.intereses = this.intereses.filter(
      (i) => i.chatId !== chatId && !publicados.has(i.inventarioId),
    );
  }

  async listClientes(): Promise<Cliente[]> {
    return [...this.clientes.values()].map((c) => structuredClone(c));
  }

  async getSession(chatId: string): Promise<Session> {
    return structuredClone(this.sessions.get(chatId) ?? newSession(chatId));
  }

  async saveSession(session: Session): Promise<void> {
    this.sessions.set(session.chatId, structuredClone(session));
  }

  async getHistory(chatId: string): Promise<StoredMessage[]> {
    const list = this.history.get(chatId) ?? [];
    const max = maxHistory();
    return structuredClone(list.slice(-max));
  }

  async appendMessages(chatId: string, msgs: StoredMessage[]): Promise<void> {
    const list = this.history.get(chatId) ?? [];
    list.push(...structuredClone(msgs));
    const max = maxHistory();
    while (list.length > max) list.shift();
    this.history.set(chatId, list);
  }

  async clearHistory(chatId: string): Promise<void> {
    this.history.delete(chatId);
  }

  async getLead(chatId: string): Promise<LeadFlags> {
    return { ...(this.leads.get(chatId) ?? { sent: false, updated: false }) };
  }

  async saveLead(chatId: string, lead: LeadFlags): Promise<void> {
    this.leads.set(chatId, { ...lead });
  }

  async markSeen(messageId: string): Promise<boolean> {
    if (!messageId) return true;
    const now = Date.now();
    for (const [id, ts] of this.seen) {
      if (now - ts > TTL_MS) this.seen.delete(id);
    }
    if (this.seen.size > MAX_SEEN) {
      const excess = this.seen.size - Math.floor(MAX_SEEN / 2);
      let i = 0;
      for (const id of this.seen.keys()) {
        if (i++ >= excess) break;
        this.seen.delete(id);
      }
    }
    if (this.seen.has(messageId)) return false;
    this.seen.set(messageId, now);
    return true;
  }

  async listPreciosGanado(): Promise<PrecioGanado[]> {
    return structuredClone(this.precios);
  }

  async listPromosForrajera(): Promise<PromoForrajera[]> {
    return structuredClone(this.promos);
  }

  async getBrake(): Promise<Brake> {
    return { ...this.brake };
  }

  async setBrake(brake: Brake): Promise<void> {
    this.brake = { ...brake };
  }

  async enqueue(items: QueueItem[]): Promise<void> {
    this.queue.push(...structuredClone(items));
  }

  async nextQueueItem(nowIso: string): Promise<QueueItem | null> {
    const due = this.queue
      .filter((q) => q.status === "pending" && q.notBefore <= nowIso)
      .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));
    return due[0] ? structuredClone(due[0]) : null;
  }

  async saveQueueItem(item: QueueItem): Promise<void> {
    const i = this.queue.findIndex((q) => q.id === item.id);
    if (i >= 0) this.queue[i] = structuredClone(item);
    else this.queue.push(structuredClone(item));
  }

  async cancelQueueByPromo(promoId: string): Promise<number> {
    let n = 0;
    for (const q of this.queue) {
      if (q.promoId === promoId && q.status === "pending") {
        q.status = "cancelled";
        n++;
      }
    }
    return n;
  }

  async countSent(sinceIso: string, untilIso: string): Promise<number> {
    return this.logs.filter(
      (l) =>
        l.status === "sent" &&
        l.createdAt >= sinceIso &&
        l.createdAt < untilIso,
    ).length;
  }

  async countSentFor(chatId: string, sinceIso: string, untilIso: string): Promise<number> {
    return this.logs.filter(
      (l) =>
        l.chatId === chatId &&
        l.status === "sent" &&
        l.createdAt >= sinceIso &&
        l.createdAt < untilIso,
    ).length;
  }

  async countByStatus(sinceIso: string, untilIso: string, status: string): Promise<number> {
    return this.logs.filter(
      (l) => l.status === status && l.createdAt >= sinceIso && l.createdAt < untilIso,
    ).length;
  }

  async logSend(entry: SendLog): Promise<void> {
    this.logs.push({ ...entry });
  }

  async saveCampana(c: Campana): Promise<void> {
    this.campanas.set(c.id, structuredClone(c));
  }

  async getCampana(id: string): Promise<Campana | null> {
    const c = this.campanas.get(id);
    return c ? structuredClone(c) : null;
  }

  async listInventario(): Promise<InventarioGanado[]> {
    return structuredClone(this.inventario);
  }

  async saveInventario(item: InventarioGanado): Promise<void> {
    const i = this.inventario.findIndex((row) => row.id === item.id);
    if (i >= 0) this.inventario[i] = structuredClone(item);
    else this.inventario.push(structuredClone(item));
  }

  async listIntereses(): Promise<InteresGanado[]> {
    return structuredClone(this.intereses);
  }

  async saveInteres(item: InteresGanado): Promise<void> {
    this.intereses.push(structuredClone(item));
  }
}
