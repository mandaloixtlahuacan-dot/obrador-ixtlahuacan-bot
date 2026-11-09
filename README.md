# Obrador Ixtlahuacán — WhatsApp Bot (Next.js / Vercel)

Bot de WhatsApp para **Obrador Ixtlahuacán** (mayorista de carne, Ixtlahuacán del Río, Jalisco).

**Stack:** Next.js App Router + TypeScript → Whapi.cloud → OpenAI Chat Completions (tool `enviar_pedido_a_admin`) → Vercel.

Puerto desde el bot Python/FastAPI. Plantilla base: Flujo Propio starter.

---

## Qué incluye

| Pieza | Rol |
|-------|-----|
| `app/api/webhook/route.ts` | Entrada Whapi: secret, `fromMe`, dedupe, sin pin, historial, tools, reply |
| `app/api/health/route.ts` | Health check (sin secretos en claro) |
| `lib/whapi.ts` | `sendText(to, body)` → `POST {WHAPI_BASE_URL}/messages/text` |
| `lib/mexicoJid.ts` | Normaliza MX a `521XXXXXXXXXX@s.whatsapp.net` |
| `lib/prompt.ts` | Cómo habla el bot. El catálogo sale de `config/client-brief.json` |
| `lib/bot.ts` | Conversación, tools y aviso al admin (1 lead + 1 actualización) |
| `lib/store/` | Ficha e historial. Memoria si no hay Supabase; schema `obrador` si hay |
| `config/negocio.json` | Datos de la familia. Vacío = no se inventan |
| `supabase/migrations/` | Tablas del schema `obrador`, con RLS |

---

## Auth del webhook

1. **Preferido:** header `x-bot-webhook-secret: <WEBHOOK_SECRET>`
2. **Fallback:** query `?secret=<WEBHOOK_SECRET>`

Si `WEBHOOK_SECRET` no está definido, el endpoint responde **401**.

Forma de URL:

```text
https://<proyecto>.vercel.app/api/webhook
https://<proyecto>.vercel.app/api/webhook?secret=<WEBHOOK_SECRET>
```

Ejemplo curl:

```bash
curl -X POST "https://<proyecto>.vercel.app/api/webhook" \
  -H "Content-Type: application/json" \
  -H "x-bot-webhook-secret: $WEBHOOK_SECRET" \
  -d '{"messages":[{"id":"test-1","from_me":false,"chat_id":"5215551234567@s.whatsapp.net","type":"text","text":{"body":"Hola"}}]}'
```

---

## Variables de entorno

```bash
WHAPI_TOKEN=
WHAPI_BASE_URL=https://gate.whapi.cloud
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
WEBHOOK_SECRET=
ADMIN_PHONE=5213312974282@s.whatsapp.net
MAX_HISTORY=24
```

Las demás (`SUPABASE_*`, `INTERMEDIARIO_PHONE`, `FORRAJERA_PEDIDOS_PHONE`, `BROADCASTS_ENABLED`, `REMINDERS_ENABLED`, `ADMIN_API_TOKEN`, `CRON_SECRET` y los topes `BROADCAST_*`) están en `.env.example`. `BROADCASTS_ENABLED` arranca en falso.

Nunca commits de `.env`, `.env.local` ni `.secrets.json`.

---

## Orden de deploy

1. **Primero Vercel** (importa este repo, configura env, deploy).
2. **Después Whapi**: apunta el webhook a la URL pública de Vercel.
3. **No uses túneles** para producción.

En Whapi (Settings → Webhook):

- URL: `https://<proyecto>.vercel.app/api/webhook`
- Método: **POST**
- Eventos: **`messages`** y/o **`messages.post`**
- Activa **`callback_persist`**
- Envía el secret en header `x-bot-webhook-secret` (o `?secret=` en la URL)

### JID México

Móviles MX en Whapi: `521` + **10 dígitos** + `@s.whatsapp.net`  
Ejemplo: `5213312974282@s.whatsapp.net`

---

## Funciones del bot (v3)

- Carne: mismo aviso al admin con `enviar_pedido_a_admin` (un lead y una actualización). Mínimo 10 kg, entrega solo en cabecera, el precio exacto lo da el Obrador.
- Cuentas al momento solo si `config/negocio.json` trae porción y, si aplica, precio por kg vigente.
- Ganado: inventario central. Quien pregunta ve especie, tipo, raza, cantidad, pueblo y fecha. No ve al ganadero. Si se interesa, el aviso va a `INTERMEDIARIO_PHONE` (por defecto `5213310184790`).
- Forrajera: el pedido (qué, cuánto, para cuándo, recoge o se lo llevan) va a `FORRAJERA_PEDIDOS_PHONE` o, si no está, a `ADMIN_PHONE`. Sin precio.
- Citas, vacunas y ficha. Si un dato de la familia está vacío, el bot dice que alguien del equipo lo confirma.
- El bot no pide ubicación. Si llega un pin, no se guarda.
- Dos lugares: el Obrador (`https://maps.google.com/?q=20.8552464,-103.2460428`) y la Forrajera El Corral de Piedra (`https://maps.google.com/?q=20.874329,-103.232947`).
- Avisos masivos apagados salvo `BROADCASTS_ENABLED=true`. Solo a quien ya escribió, y sin nombre ni número del ganadero.
- Promos: `POST /api/admin/promos/preview` (no envía) → `POST /api/admin/promos/{id}/send` (un solo uso, 30 min) → `POST /api/admin/promos/{id}/stop`. Header `x-admin-token`.

Con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` la ficha y el historial viven en el schema `obrador`. Sin esas variables, la carne sigue en memoria.

Migración: `supabase/migrations/20261109160000_obrador_schema.sql`. Hay que exponer el schema `obrador` en la Data API. Los precios de ganado no se inventan: la tabla `precios_ganado` empieza vacía y el cron de SNIIM no carga nada hasta que se encienda a propósito.

```bash
npm test
```

---

## Desarrollo local

```bash
cp .env.example .env.local
# llena WHAPI_TOKEN, OPENAI_API_KEY, WEBHOOK_SECRET
npm install
npm run build
npm run dev
```

Health: `GET http://localhost:3000/api/health`

---

## Personalizar

Edita `config/client-brief.json` (catálogo de carne, horario del obrador) y `config/negocio.json` (lo que solo da la familia: encargados, porciones, precios por kg, horario y teléfono de la forrajera, citas, guías, reabasto). Mientras un campo esté vacío, el bot no lo inventa.
