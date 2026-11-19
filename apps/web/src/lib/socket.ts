import { io, type Socket } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

let instancia: Socket | null = null;

export function obtenerSocket(): Socket {
  if (!instancia) {
    instancia = io(API_URL, {
      withCredentials: true,
      autoConnect: true,
    });
  }
  return instancia;
}

export function cerrarSocket(): void {
  if (instancia) {
    instancia.disconnect();
    instancia = null;
  }
}
