alter table deals add column if not exists notes text;

create table if not exists context_reviews (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references deals(id) on delete cascade,
  submitted_by text references profiles(id),
  authority_level integer not null default 1,
  content text not null,
  source_type text not null default 'note' check (source_type in ('note', 'file')),
  file_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  reviewed_by text references profiles(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists context_reviews_deal_id_idx on context_reviews(deal_id);
create index if not exists context_reviews_status_idx on context_reviews(status) where status = 'pending';
