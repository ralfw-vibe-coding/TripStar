insert into ingest_email_addresses (email, user_id, is_primary, created_at, data)
select
  email,
  id,
  true,
  created_at,
  jsonb_build_object(
    'email', email,
    'userId', id,
    'isPrimary', true,
    'createdAt', data->>'createdAt'
  )
from users
on conflict (email) do nothing;
