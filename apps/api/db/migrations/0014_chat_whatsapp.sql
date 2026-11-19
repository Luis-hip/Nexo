-- 0014_chat_whatsapp.sql
-- Búsqueda de texto completo en mensajes (CH-08) e índices para cola/webhook de WhatsApp

ALTER TABLE mensajes
  ADD COLUMN IF NOT EXISTS busqueda_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('spanish', coalesce(texto, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_mensajes_busqueda_tsv
  ON mensajes USING GIN (busqueda_tsv);

CREATE INDEX IF NOT EXISTS idx_mensajes_conv_seq
  ON mensajes (conversacion_id, seq DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_mensajes_proveedor_id
  ON whatsapp_mensajes (proveedor_mensaje_id)
  WHERE proveedor_mensaje_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eventos_dominio_pendientes
  ON eventos_dominio (creado_en ASC)
  WHERE procesado_en IS NULL;