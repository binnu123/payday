-- Run once in Supabase: SQL Editor > New query > paste > Run
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('income','expense')),
  amount numeric(12,2) not null check (amount > 0),
  category text not null,
  note text,
  date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'transactions' and policyname = 'own rows') then
    create policy "own rows" on public.transactions
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.split_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description text not null,
  person text not null,
  amount numeric(12,2) not null check (amount > 0),
  settled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.split_shares enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'split_shares' and policyname = 'own rows') then
    create policy "own rows" on public.split_shares for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.create_split(p_description text, p_category text, p_date date, p_own numeric, p_shares jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare share jsonb;
begin
  if auth.uid() is null or length(trim(p_description)) = 0 or p_own <= 0 or jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then
    raise exception 'Invalid split';
  end if;
  insert into transactions (type, amount, category, note, date) values ('expense', p_own, p_category, p_description, p_date);
  for share in select * from jsonb_array_elements(p_shares) loop
    if length(trim(share->>'person')) = 0 or (share->>'amount')::numeric <= 0 then raise exception 'Invalid share'; end if;
    insert into split_shares (description, person, amount) values (p_description, trim(share->>'person'), (share->>'amount')::numeric);
  end loop;
end $$;

create index if not exists transactions_user_date on public.transactions (user_id, date);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('lent', 'borrowed')),
  person text not null check (length(trim(person)) between 1 and 40),
  emi numeric(12,2) not null check (emi > 0),
  total_emis integer not null check (total_emis > 0),
  paid_emis integer not null default 0 check (paid_emis >= 0 and paid_emis <= total_emis),
  next_due date not null,
  created_at timestamptz not null default now()
);

alter table public.loans enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loans' and policyname = 'own rows') then
    create policy "own rows" on public.loans
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists loans_user_created on public.loans (user_id, created_at desc);

create table if not exists public.category_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  unique (user_id, month, category)
);
alter table public.category_budgets enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'category_budgets' and policyname = 'own rows') then
    create policy "own rows" on public.category_budgets
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
