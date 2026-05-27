create table if not exists schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  email text not null unique,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  data jsonb not null
);

create table if not exists otp_challenges (
  id text primary key,
  email text not null,
  otp text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null,
  data jsonb not null
);

create index if not exists otp_challenges_email_created_idx on otp_challenges (email, created_at desc);

create table if not exists auth_sessions (
  token text primary key,
  user_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null,
  revoked_at timestamptz,
  data jsonb not null
);

create table if not exists trips (
  id text primary key,
  owner_user_id text not null,
  trip_number text not null unique,
  start_date date,
  end_date date,
  archived_at timestamptz,
  data jsonb not null
);

create index if not exists trips_owner_idx on trips (owner_user_id);

create table if not exists documents (
  id text primary key,
  trip_id text,
  storage_key text,
  created_at timestamptz not null,
  deleted_at timestamptz,
  data jsonb not null
);

create table if not exists bookings (
  id text primary key,
  trip_id text,
  source_document_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  deleted_at timestamptz,
  data jsonb not null
);

create index if not exists bookings_starts_at_idx on bookings (starts_at);
create index if not exists bookings_trip_idx on bookings (trip_id);

create table if not exists analysis_jobs (
  id text primary key,
  status text not null,
  current_user_id text not null,
  created_at timestamptz not null,
  completed_at timestamptz,
  data jsonb not null
);

create table if not exists activity_log (
  id text primary key,
  timestamp timestamptz not null,
  level text not null,
  scope text not null,
  document_name text,
  data jsonb not null
);

create index if not exists activity_log_timestamp_idx on activity_log (timestamp desc);
