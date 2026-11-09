import { norm } from "@/lib/text";

export type Command =
  | { type: "opt_out" }
  | { type: "opt_in" }
  | { type: "borrar" }
  | { type: "persona" }
  | { type: "ficha" }
  | { type: "no_compartir" }
  | { type: "no_entiendo" }
  | { type: "saludo" }
  | { type: "menu" }
  | { type: "pausar" }
  | { type: "seguir" };

export function matchCommand(text: string): Command | null {
  const t = norm(text);
  if (!t) return null;
  if (
    t === "ya no" ||
    t === "ya no quiero avisos" ||
    t === "ya no quiero mas avisos" ||
    t === "no quiero avisos" ||
    t === "no me mandes avisos" ||
    t === "dejen de avisarme"
  ) {
    return { type: "opt_out" };
  }
  if (
    t === "quiero avisos" ||
    t === "si quiero avisos" ||
    t === "mandenme avisos"
  ) {
    return { type: "opt_in" };
  }
  if (
    t === "borrame" ||
    t === "borra mis datos" ||
    t === "borra mi ficha" ||
    t === "borra todo" ||
    t === "eliminar mis datos"
  ) {
    return { type: "borrar" };
  }
  if (
    t === "persona" ||
    t === "quiero hablar con alguien" ||
    t === "quiero una persona" ||
    t === "hablar con una persona" ||
    t === "pasame con alguien" ||
    t === "quiero que me hable alguien"
  ) {
    return { type: "persona" };
  }
  if (
    t === "que tienes de mi" ||
    t === "que sabes de mi" ||
    t === "mis datos" ||
    t === "que datos tienes"
  ) {
    return { type: "ficha" };
  }
  if (
    t === "ya no compartas mi numero" ||
    t === "no compartas mi numero" ||
    t === "no pasen mi numero"
  ) {
    return { type: "no_compartir" };
  }
  if (
    t === "no entiendo" ||
    t === "no te entiendo" ||
    t === "que" ||
    t === "no se" ||
    t === "no entendi"
  ) {
    return { type: "no_entiendo" };
  }
  if (
    /^(hola|buenas|buenos dias|buenas tardes|buenas noches|que tal|hey|buen dia)$/.test(
      t,
    )
  ) {
    return { type: "saludo" };
  }
  if (t === "inicio" || t === "menu" || t === "otra cosa") return { type: "menu" };
  if (t === "#avisos pausa" || t === "#avisos parar") return { type: "pausar" };
  if (t === "#avisos seguir" || t === "#avisos reanudar") return { type: "seguir" };
  return null;
}

export function esSi(text: string): boolean {
  const t = norm(text);
  return /^(si|si claro|claro|va|sale|de acuerdo|ok|okay|orale|esta bien|adelante|simon|por supuesto)$/.test(
    t,
  );
}

export function esNo(text: string): boolean {
  const t = norm(text);
  return /^(no|nel|nop|no gracias|no quiero|nel pastel)$/.test(t);
}
