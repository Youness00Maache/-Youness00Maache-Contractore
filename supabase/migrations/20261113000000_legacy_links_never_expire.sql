-- Approval links on documents created by the old app never expired. The import (20261112000400) left
-- approval_expires_at null, but the documents insert trigger turned that into "60 days from the import",
-- so links already emailed to clients would have stopped working in January. Restore the old behaviour for
-- those documents only (null = no expiry in get_document_by_token / approve / decline). New links keep the
-- 60-day lifetime.
update public.documents d
   set approval_expires_at = null
 where d.approval_used_at is null
   and exists (select 1 from legacy_backup.documents l where l.id::text = d.id::text);
