import axios from "axios";

// Obtener la URL base del backend de forma dinámica.
// Si se define VITE_API_URL, se utiliza esa URL.
// De lo contrario, se usan rutas relativas (""), lo que permite que las peticiones se enruten
// a través del proxy inverso (Nginx en Docker o proxy de Vite en desarrollo).
// Esto hace que la aplicación funcione inmediatamente desde cualquier dispositivo en la red local
// (celular, tablet, otra computadora) sin importar qué IP tenga el servidor.
const getBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, "");
  }
  return "";
};

const baseUrl = getBaseUrl();

const api = axios.create({
  baseURL: baseUrl ? `${baseUrl}/api/v1` : "/api/v1"
});

export const monitoringApi = axios.create({
  baseURL: baseUrl || ""
});

export default api;
