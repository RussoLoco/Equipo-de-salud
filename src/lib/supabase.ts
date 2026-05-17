import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
let supabaseUrl = rawSupabaseUrl
  ? rawSupabaseUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "")
  : "";

if (supabaseUrl && !supabaseUrl.startsWith("http")) {
  supabaseUrl = "";
}

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Faltan las credenciales de Supabase en las variables de entorno o son inválidas.",
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key",
);

// Utilidades de autenticación de Supabase
export const loginWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
      skipBrowserRedirect: window !== window.top, // Skip redirect if in iframe
    },
  });
  if (error) throw error;

  if (data?.url && window !== window.top) {
    const authWindow = window.open(data.url, "_blank", "width=500,height=600");
    if (!authWindow) {
      throw new Error(
        'Las ventanas emergentes están bloqueadas. Usa el botón de "Abrir en nueva pestaña" de AI Studio.',
      );
    }
  }
  return data;
};

export const logout = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};
