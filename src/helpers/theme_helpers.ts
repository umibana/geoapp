import { ThemeMode } from "@/types/theme-mode";

const THEME_KEY = "theme";

/**
 * Preferencias de tema del usuario
 * Contiene el tema del sistema y la preferencia local guardada
 */
export interface ThemePreferences {
  system: ThemeMode;        // Tema detectado del sistema
  local: ThemeMode | null;  // Tema guardado localmente por el usuario
}

/**
 * Obtiene las preferencias actuales de tema
 * Combina el tema del sistema con la preferencia local guardada
 * @returns Preferencias de tema actuales
 */
export async function getCurrentTheme(): Promise<ThemePreferences> {
  const currentTheme = await window.themeMode.current();
  const localTheme = localStorage.getItem(THEME_KEY) as ThemeMode | null;

  return {
    system: currentTheme,
    local: localTheme,
  };
}

/**
 * Establece un nuevo tema
 * Aplica el tema tanto al sistema como al documento y lo guarda localmente
 * @param newTheme Nuevo tema a aplicar (dark, light, system)
 */
export async function setTheme(newTheme: ThemeMode) {
  switch (newTheme) {
    case "dark":
      await window.themeMode.dark();
      updateDocumentTheme(true);
      break;
    case "light":
      await window.themeMode.light();
      updateDocumentTheme(false);
      break;
    case "system": {
      const isDarkMode = await window.themeMode.system();
      updateDocumentTheme(isDarkMode);
      break;
    }
  }

  localStorage.setItem(THEME_KEY, newTheme);
}

/**
 * Alterna entre tema claro y oscuro
 * Cambia automáticamente al tema opuesto al actual
 */
export async function toggleTheme() {
  const isDarkMode = await window.themeMode.toggle();
  const newTheme = isDarkMode ? "dark" : "light";

  updateDocumentTheme(isDarkMode);
  localStorage.setItem(THEME_KEY, newTheme);
}

/**
 * Sincroniza el tema con la preferencia local guardada
 * Si no hay preferencia local, establece el tema del sistema
 */
export async function syncThemeWithLocal() {
  const { local } = await getCurrentTheme();
  if (!local) {
    setTheme("system");
    return;
  }

  await setTheme(local);
}

/**
 * Actualiza las clases CSS del documento para reflejar el tema
 * Añade o remueve la clase 'dark' del elemento html
 * @param isDarkMode Si el tema oscuro debe estar activo
 */
function updateDocumentTheme(isDarkMode: boolean) {
  if (!isDarkMode) {
    document.documentElement.classList.remove("dark");
  } else {
    document.documentElement.classList.add("dark");
  }
}
