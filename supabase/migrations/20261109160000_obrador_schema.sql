-- Obrador + Forrajera v3
-- Schema propio para no mezclar con otras tablas del proyecto.
-- Acceso solo con service role, desde el servidor. No hay políticas para anon/authenticated.
--
-- Después de aplicar, en Supabase → Project Settings → Data API → Exposed schemas
-- agrega `obrador` además de public. Sin ese paso el cliente JS no ve el schema.
-- No se guarda el pin del cliente ni su dirección. El pueblo es solo texto.

create schema if not exists obrador;

revoke all on schema obrador from public;
revoke all on schema obrador from anon, authenticated;
grant usage on schema obrador to service_role;

create table obrador.clientes (
  chat_id text primary key,
  telefono text,
  nombre text,
  pueblo text,
  zona text check (zona is null or zona in ('municipio', 'cerca', 'lejos')),
  negocio text,
  tipo_negocio text,
  etiquetas text[] not null default '{}',
  recibe_avisos boolean not null default true,
  recibe_avisos_cambio timestamptz,
  comparte_numero_general text not null default 'sin_preguntar'
    check (comparte_numero_general in ('si', 'no', 'sin_preguntar')),
  comparte_numero_en timestamptz,
  kilos_habituales text,
  frecuencia text,
  productos_interes text,
  notas_encargado text,
  aviso_bienvenida_enviado boolean not null default false,
  ultima_conversacion timestamptz,
  sin_respuesta_avisos integer not null default 0,
  solo_resumen_semanal boolean not null default false,
  fuera_de_lista boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table obrador.sesiones (
  chat_id text primary key references obrador.clientes (chat_id) on delete cascade,
  pending jsonb,
  misunderstood integer not null default 0,
  topic text,
  updated_at timestamptz not null default now()
);

create table obrador.mensajes (
  id bigint generated always as identity primary key,
  chat_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index mensajes_chat_idx on obrador.mensajes (chat_id, id);

create table obrador.lead_flags (
  chat_id text primary key,
  sent boolean not null default false,
  updated boolean not null default false
);

create table obrador.mensajes_vistos (
  message_id text primary key,
  seen_at timestamptz not null default now()
);

create table obrador.animales (
  id uuid primary key,
  chat_id text not null references obrador.clientes (chat_id) on delete cascade,
  especie text not null,
  raza_tipo text not null default '',
  cantidad numeric,
  peso_edad text
);

create table obrador.ventas (
  id uuid primary key,
  chat_id text not null references obrador.clientes (chat_id) on delete cascade,
  especie text not null,
  raza_tipo text not null default '',
  cantidad numeric,
  peso_edad text,
  pueblo text,
  comparte_numero boolean not null default false,
  estado text not null default 'activa' check (estado in ('activa', 'vendida', 'vencida')),
  created_at timestamptz not null default now()
);
create index ventas_estado_idx on obrador.ventas (estado, created_at);

create table obrador.busquedas (
  id uuid primary key,
  chat_id text not null references obrador.clientes (chat_id) on delete cascade,
  especie text not null,
  raza_tipo text not null default '',
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table obrador.pedidos_carne (
  id uuid primary key,
  chat_id text not null references obrador.clientes (chat_id) on delete cascade,
  productos text not null default '',
  negocio text,
  entrega text not null default '',
  created_at timestamptz not null default now()
);

create table obrador.vacunas (
  id uuid primary key,
  chat_id text not null references obrador.clientes (chat_id) on delete cascade,
  animal text not null,
  vacuna text,
  fecha_aplicada date,
  proxima date,
  avisado boolean not null default false
);

create table obrador.citas (
  id uuid primary key,
  chat_id text not null references obrador.clientes (chat_id) on delete cascade,
  lugar text not null check (lugar in ('obrador', 'forrajera')),
  motivo text not null default '',
  dia date not null,
  hora text not null,
  estado text not null default 'apartada' check (estado in ('apartada', 'confirmada', 'cancelada')),
  recordatorio_enviado boolean not null default false,
  created_at timestamptz not null default now()
);

create table obrador.compras_forrajera (
  id uuid primary key,
  chat_id text not null references obrador.clientes (chat_id) on delete cascade,
  producto text not null,
  fecha date not null
);

-- La llena un cargador aparte (SNIIM). El bot solo lee. Vacía = no hay precio.
create table obrador.precios_ganado (
  id uuid primary key default gen_random_uuid(),
  animal text not null,
  presentacion text not null,
  destino text not null,
  destino_nombre text,
  precio_min numeric,
  precio_max numeric,
  unidad text not null default 'kg',
  fecha date not null,
  fuente text not null,
  created_at timestamptz not null default now()
);
create index precios_ganado_idx on obrador.precios_ganado (animal, fecha desc);

create table obrador.promos_forrajera (
  id uuid primary key default gen_random_uuid(),
  producto text not null,
  presentacion text,
  precio_promo numeric not null,
  precio_normal numeric,
  vigente_hasta date not null,
  cargada_por text,
  created_at timestamptz not null default now()
);

create table obrador.cola_envios (
  id uuid primary key,
  tipo text not null,
  chat_id text not null,
  cuerpo text not null,
  promo_id uuid,
  priority integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'cancelled', 'skipped')),
  not_before timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index cola_pendiente_idx on obrador.cola_envios (status, not_before);

create table obrador.envios_log (
  id uuid primary key,
  chat_id text not null,
  tipo text not null,
  status text not null,
  created_at timestamptz not null default now()
);
create index envios_log_idx on obrador.envios_log (created_at, status);

create table obrador.campanas_promo (
  id uuid primary key,
  grupo text not null check (grupo in ('carne', 'ganadero', 'todos')),
  texto text not null,
  texto_final text not null,
  destinatarios integer not null default 0,
  tiempo_estimado_min integer not null default 0,
  status text not null check (status in ('preview', 'queued', 'stopped')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used boolean not null default false
);

create table obrador.freno (
  id integer primary key default 1 check (id = 1),
  activo boolean not null default false,
  motivo text,
  fail_streak integer not null default 0,
  hold_until timestamptz,
  updated_at timestamptz not null default now()
);

insert into obrador.freno (id) values (1);

-- RLS encendido y sin políticas: anon y authenticated no leen ni escriben.
-- service_role tiene BYPASSRLS y es el único rol con GRANT.

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'obrador'
  loop
    execute format('alter table obrador.%I enable row level security', t);
    execute format('alter table obrador.%I force row level security', t);
    execute format('revoke all on table obrador.%I from public, anon, authenticated', t);
    execute format('grant all on table obrador.%I to service_role', t);
  end loop;
end $$;

grant all on all sequences in schema obrador to service_role;
revoke all on all sequences in schema obrador from public, anon, authenticated;

alter default privileges in schema obrador revoke all on tables from public, anon, authenticated;
alter default privileges in schema obrador grant all on tables to service_role;
alter default privileges in schema obrador revoke all on sequences from public, anon, authenticated;
alter default privileges in schema obrador grant all on sequences to service_role;
