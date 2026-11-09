import { supabaseConfigured } from "@/lib/config";
import { MemoryStore } from "@/lib/store/memory";
import { SupabaseStore } from "@/lib/store/supabase";
import type { Store } from "@/lib/store/types";

let singleton: Store | null = null;

export function createStore(): Store {
  if (!supabaseConfigured()) return new MemoryStore();
  return new SupabaseStore();
}

export function getStore(): Store {
  if (!singleton) singleton = createStore();
  return singleton;
}

export function resetStoreForTests(): void {
  singleton = null;
}
