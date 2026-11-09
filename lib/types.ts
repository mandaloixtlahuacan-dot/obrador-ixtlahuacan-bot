export type Zona = "municipio" | "cerca" | "lejos";

export type Animal = {
  id: string;
  especie: string;
  razaTipo: string;
  cantidad: number | null;
  pesoEdad: string | null;
};

export type Venta = {
  id: string;
  chatId: string;
  especie: string;
  razaTipo: string;
  cantidad: number | null;
  pesoEdad: string | null;
  pueblo: string | null;
  comparteNumero: boolean;
  estado: "activa" | "vendida" | "vencida";
  createdAt: string;
};

export type Busqueda = {
  id: string;
  chatId: string;
  especie: string;
  razaTipo: string;
  createdAt: string;
  activa: boolean;
};

export type PedidoCarne = {
  id: string;
  chatId: string;
  productos: string;
  negocio: string | null;
  entrega: string;
  createdAt: string;
};

export type Vacuna = {
  id: string;
  chatId: string;
  animal: string;
  vacuna: string | null;
  fechaAplicada: string | null;
  proxima: string | null;
  avisado: boolean;
};

export type Cita = {
  id: string;
  chatId: string;
  lugar: "obrador" | "forrajera";
  motivo: string;
  dia: string;
  hora: string;
  estado: "apartada" | "confirmada" | "cancelada";
  recordatorioEnviado: boolean;
  createdAt: string;
};

export type CompraForrajera = {
  id: string;
  producto: string;
  fecha: string;
};

export type Cliente = {
  chatId: string;
  telefono: string | null;
  nombre: string | null;
  pueblo: string | null;
  zona: Zona | null;
  negocio: string | null;
  tipoNegocio: string | null;
  etiquetas: string[];
  recibeAvisos: boolean;
  recibeAvisosCambio: string | null;
  comparteNumeroGeneral: "si" | "no" | "sin_preguntar";
  comparteNumeroEn: string | null;
  kilosHabituales: string | null;
  frecuencia: string | null;
  productosInteres: string | null;
  notasEncargado: string | null;
  avisoBienvenidaEnviado: boolean;
  ultimaConversacion: string | null;
  sinRespuestaAvisos: number;
  soloResumenSemanal: boolean;
  fueraDeLista: boolean;
  animales: Animal[];
  ventas: Venta[];
  busquedas: Busqueda[];
  pedidos: PedidoCarne[];
  vacunas: Vacuna[];
  citas: Cita[];
  comprasForrajera: CompraForrajera[];
};

export type Pending =
  | {
      kind: "pueblo";
      step: "origen" | "rancho" | "lejos" | "otro";
      resume: string;
    }
  | {
      kind: "permiso_numero";
      ventaId: string;
      interesadoChatId: string;
      interesadoNombre: string | null;
      interesadoPueblo: string | null;
      raza: string;
      pedidoEn: string;
    };

export type Session = {
  chatId: string;
  pending: Pending | null;
  misunderstood: number;
  topic: string | null;
  updatedAt: string | null;
};

export type StoredMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
};

export type LeadFlags = { sent: boolean; updated: boolean };

export type PrecioGanado = {
  id: string;
  animal: string;
  presentacion: "pie" | "canal" | string;
  destino: string;
  destinoNombre: string | null;
  precioMin: number | null;
  precioMax: number | null;
  unidad: string;
  fecha: string;
  fuente: string;
};

export type PromoForrajera = {
  id: string;
  producto: string;
  presentacion: string | null;
  precioPromo: number;
  precioNormal: number | null;
  vigenteHasta: string;
  cargadaPor: string | null;
};

export type QueueItem = {
  id: string;
  tipo: "venta" | "resumen" | "promo" | "resumen_semanal";
  chatId: string;
  cuerpo: string;
  promoId: string | null;
  priority: number;
  status: "pending" | "sent" | "failed" | "cancelled" | "skipped";
  notBefore: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
};

export type SendLog = {
  id: string;
  chatId: string;
  tipo: string;
  status: string;
  createdAt: string;
};

export type Campana = {
  id: string;
  grupo: "carne" | "ganadero" | "todos";
  texto: string;
  textoFinal: string;
  destinatarios: number;
  tiempoEstimadoMin: number;
  status: "preview" | "queued" | "stopped";
  createdAt: string;
  expiresAt: string;
  used: boolean;
};

export type Brake = {
  activo: boolean;
  motivo: string | null;
  failStreak: number;
  holdUntil: string | null;
};

export type PrecioKg = {
  producto: string;
  precio: number;
  vigente_desde?: string | null;
  vigente_hasta?: string | null;
  actualizado_por?: string | null;
};

export type HorarioCita = {
  lugar: "obrador" | "forrajera";
  dias: string[];
  horas: string[];
  cupo?: number;
};

export type GuiaRacion = {
  para: string;
  objetivo: string;
  texto: string;
  fuente?: string;
};

export type NegocioConfig = {
  ubicaciones: {
    obrador: { nombre: string; maps: string };
    forrajera: {
      nombre: string;
      maps: string;
      horario: string;
      telefono: string;
      catalogo: string[];
    };
  };
  encargados: { obrador: string; forrajera: string; citas: string };
  hora_llamada: string;
  porcion_kg_por_persona: Record<string, number>;
  precio_kg: PrecioKg[];
  horarios_cita: HorarioCita[];
  dias_reabasto: Record<string, number>;
  guias_racion: GuiaRacion[];
  ventas_vencen_dias: number | null;
  busca_vigente_dias: number | null;
  horas_sin_respuesta_permiso: number | null;
  dias_aviso_vacuna: number | null;
  recordatorio_vispera_hora: string | null;
  resumen_diario_hora: string | null;
};
