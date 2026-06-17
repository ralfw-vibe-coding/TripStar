create table if not exists ingest_email_addresses (
  email text primary key,
  user_id text not null references users(id),
  is_primary boolean not null,
  created_at timestamptz not null default now(),
  data jsonb not null
);

create index if not exists ingest_email_addresses_user_idx on ingest_email_addresses (user_id);
