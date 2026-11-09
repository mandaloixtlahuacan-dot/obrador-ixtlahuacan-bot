import { NextRequest } from "next/server";
import { adminAuthorized } from "@/lib/admin/promos";
import { defaultDeps } from "@/lib/deps";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!adminAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const etiqueta = new URL(req.url).searchParams.get("etiqueta");
  const deps = defaultDeps();
  let fichas = await deps.store.listClientes();
  if (etiqueta) {
    fichas = fichas.filter((c) => c.etiquetas.includes(etiqueta));
  }
  return Response.json({
    ok: true,
    total: fichas.length,
    fichas: fichas.map((c) => ({
      chat_id: c.chatId,
      nombre: c.nombre,
      telefono: c.telefono,
      pueblo: c.pueblo,
      zona: c.zona,
      negocio: c.negocio,
      etiquetas: c.etiquetas,
      recibe_avisos: c.recibeAvisos,
      animales: c.animales,
      ventas: c.ventas,
      busquedas: c.busquedas,
      pedidos: c.pedidos.length,
    })),
  });
}
