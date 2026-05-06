// auth/handlers.ts
// Exporta solo los handlers HTTP — aislado del resto para evitar problemas de Edge Runtime
import { handlers } from "."

export const { GET, POST } = handlers