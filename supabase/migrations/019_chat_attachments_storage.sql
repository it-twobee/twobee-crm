-- Bucket Supabase Storage per allegati chat
-- NOTA: eseguire anche manualmente da Supabase Dashboard → Storage → New Bucket
-- nome: chat-attachments, public: true

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  true,
  52428800, -- 50MB max
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
    'application/pdf',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip','application/x-zip-compressed',
    'text/plain','text/csv',
    'video/mp4','video/quicktime'
  ]
) ON CONFLICT (id) DO NOTHING;

-- Policy: chiunque autenticato può leggere e caricare
CREATE POLICY IF NOT EXISTS "auth read chat attachments"
  ON storage.objects FOR SELECT USING (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY IF NOT EXISTS "auth upload chat attachments"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY IF NOT EXISTS "auth delete own chat attachments"
  ON storage.objects FOR DELETE USING (bucket_id = 'chat-attachments' AND auth.uid() = owner);
