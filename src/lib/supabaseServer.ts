import { createClient } from "@supabase/supabase-js";

console.log("SUPABASE_URL:", import.meta.env.SUPABASE_URL);
console.log("SUPABASE_SERVICE_ROLE_KEY existe?:", !!import.meta.env.SUPABASE_SERVICE_ROLE_KEY);


const url = import.meta.env.SUPABASE_URL;
const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
}

export const supabaseServer = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
