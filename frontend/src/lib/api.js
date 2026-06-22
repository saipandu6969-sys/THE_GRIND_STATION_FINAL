import axios from "axios";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL || "https://api.thegrindstation.in";

export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("gs_token");

  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }

  return config;
});

export function formatErr(detail) {
  if (detail == null) return "Something went wrong";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e?.msg || JSON.stringify(e))).join(" ");
  if (detail?.msg) return detail.msg;
  return String(detail);
}

export default api;
