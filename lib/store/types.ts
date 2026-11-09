import type {
  Brake,
  Campana,
  Cliente,
  LeadFlags,
  PrecioGanado,
  PromoForrajera,
  QueueItem,
  SendLog,
  Session,
  StoredMessage,
} from "@/lib/types";

export interface Store {
  readonly mode: "memory" | "supabase";
  ping(): Promise<boolean>;
  getCliente(chatId: string): Promise<Cliente | null>;
  saveCliente(cliente: Cliente): Promise<void>;
  deleteCliente(chatId: string): Promise<void>;
  listClientes(): Promise<Cliente[]>;
  getSession(chatId: string): Promise<Session>;
  saveSession(session: Session): Promise<void>;
  getHistory(chatId: string): Promise<StoredMessage[]>;
  appendMessages(chatId: string, msgs: StoredMessage[]): Promise<void>;
  clearHistory(chatId: string): Promise<void>;
  getLead(chatId: string): Promise<LeadFlags>;
  saveLead(chatId: string, lead: LeadFlags): Promise<void>;
  markSeen(messageId: string): Promise<boolean>;
  listPreciosGanado(): Promise<PrecioGanado[]>;
  listPromosForrajera(): Promise<PromoForrajera[]>;
  getBrake(): Promise<Brake>;
  setBrake(brake: Brake): Promise<void>;
  enqueue(items: QueueItem[]): Promise<void>;
  nextQueueItem(nowIso: string): Promise<QueueItem | null>;
  saveQueueItem(item: QueueItem): Promise<void>;
  cancelQueueByPromo(promoId: string): Promise<number>;
  countSent(sinceIso: string, untilIso: string): Promise<number>;
  countSentFor(chatId: string, sinceIso: string, untilIso: string): Promise<number>;
  countByStatus(sinceIso: string, untilIso: string, status: string): Promise<number>;
  logSend(entry: SendLog): Promise<void>;
  saveCampana(c: Campana): Promise<void>;
  getCampana(id: string): Promise<Campana | null>;
}
