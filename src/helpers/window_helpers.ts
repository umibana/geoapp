// Manejo de ventanas de electron en el sistema operativo

/**
 * Minimiza la ventana de la aplicación
 * Utiliza la API de Electron para minimizar la ventana principal
 */
export async function minimizeWindow() {
  await window.electronWindow.minimize();
}
/**
 * Maximiza la ventana de la aplicación
 * Utiliza la API de Electron para maximizar/restaurar la ventana principal
 */
export async function maximizeWindow() {
  await window.electronWindow.maximize();
}
/**
 * Cierra la ventana de la aplicación
 * Utiliza la API de Electron para cerrar la ventana principal
 */
export async function closeWindow() {
  await window.electronWindow.close();
}
/**
 * Obtiene el tamaño actual de la ventana
 * @returns Objeto con las dimensiones width y height de la ventana
 */
export async function getWindowSize() {
  return await window.electronWindow.getSize();
}
