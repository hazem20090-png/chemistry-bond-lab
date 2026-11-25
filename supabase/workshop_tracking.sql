-- Teacher workshop tracking for the public GitHub Pages front end.
-- No names or access codes are stored in this repository.

create extension if not exists pgcrypto;

create table if not exists public.workshop_teachers (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null unique,
  full_name text not null,
  first_joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  visits integer not null default 1 check (visits > 0)
);

create table if not exists public.workshop_sessions (
  token_hash text primary key,
  teacher_id uuid not null references public.workshop_teachers(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);

create table if not exists public.workshop_attempts (
  id bigint generated always as identity primary key,
  teacher_id uuid not null references public.workshop_teachers(id) on delete cascade,
  lesson_id text not null default 'g10-covalent',
  score integer not null default 0,
  max_score integer not null default 0,
  time_spent_seconds integer not null default 0,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.workshop_rewards (
  id bigint generated always as identity primary key,
  teacher_id uuid not null references public.workshop_teachers(id) on delete cascade,
  awarded_at timestamptz not null default now()
);

create table if not exists public.workshop_roster (
  id bigint generated always as identity primary key,
  normalized_name text not null unique,
  full_name text not null,
  sort_order integer not null default 0
);

alter table public.workshop_teachers enable row level security;
alter table public.workshop_sessions enable row level security;
alter table public.workshop_attempts enable row level security;
alter table public.workshop_rewards enable row level security;
alter table public.workshop_roster enable row level security;

revoke all on public.workshop_teachers, public.workshop_sessions,
  public.workshop_attempts, public.workshop_rewards, public.workshop_roster
  from anon, authenticated;

create or replace function public.workshop_normalize_name(p_name text)
returns text language sql immutable set search_path = public as $$
  select lower(regexp_replace(trim(coalesce(p_name,'')), '\\s+', ' ', 'g'))
$$;

create or replace function public.workshop_teacher_join(p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name,'')), '\\s+', ' ', 'g');
  v_key text;
  v_teacher public.workshop_teachers;
  v_token text := gen_random_uuid()::text || gen_random_uuid()::text;
  v_rewards integer;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    return jsonb_build_object('ok',false,'message','invalid_name');
  end if;
  v_key := public.workshop_normalize_name(v_name);
  insert into public.workshop_teachers(normalized_name,full_name)
  values(v_key,v_name)
  on conflict(normalized_name) do update set
    full_name=excluded.full_name,
    last_seen_at=now(),
    visits=public.workshop_teachers.visits+1
  returning * into v_teacher;
  insert into public.workshop_sessions(token_hash,teacher_id)
  values(encode(extensions.digest(v_token,'sha256'),'hex'),v_teacher.id);
  select count(*)::integer into v_rewards from public.workshop_rewards where teacher_id=v_teacher.id;
  return jsonb_build_object('ok',true,'token',v_token,'teacher',jsonb_build_object('id',v_teacher.id,'name',v_teacher.full_name),'rewardCount',v_rewards);
end $$;

create or replace function public.workshop_session_teacher(p_token text)
returns uuid language sql stable security definer set search_path = public as $$
  select teacher_id from public.workshop_sessions
  where token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex') and expires_at>now()
  limit 1
$$;

create or replace function public.workshop_teacher_portal(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_teacher uuid; v_rewards integer;
begin
  v_teacher := public.workshop_session_teacher(p_token);
  if v_teacher is null then return jsonb_build_object('ok',false); end if;
  update public.workshop_teachers set last_seen_at=now() where id=v_teacher;
  select count(*)::integer into v_rewards from public.workshop_rewards where teacher_id=v_teacher;
  return jsonb_build_object('ok',true,'rewardCount',v_rewards);
end $$;

create or replace function public.workshop_record_progress(
  p_token text, p_score integer, p_max_score integer,
  p_time_spent_seconds integer default 0, p_answers jsonb default '[]'::jsonb,
  p_lesson_id text default 'g10-covalent'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_teacher uuid;
begin
  v_teacher := public.workshop_session_teacher(p_token);
  if v_teacher is null then return jsonb_build_object('ok',false); end if;
  insert into public.workshop_attempts(teacher_id,lesson_id,score,max_score,time_spent_seconds,answers)
  values(v_teacher,coalesce(nullif(p_lesson_id,''),'g10-covalent'),greatest(coalesce(p_score,0),0),greatest(coalesce(p_max_score,0),0),greatest(coalesce(p_time_spent_seconds,0),0),case when jsonb_typeof(coalesce(p_answers,'[]'::jsonb))='array' then p_answers else '[]'::jsonb end);
  update public.workshop_teachers set last_seen_at=now() where id=v_teacher;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.workshop_teacher_authorized(p_token text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_dashboard jsonb;
begin
  v_dashboard := public.teacher_dashboard(p_token);
  return coalesce((v_dashboard->>'ok')::boolean,false);
exception when others then return false;
end $$;

create or replace function public.teacher_workshop_dashboard(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_roster jsonb; v_attendees jsonb;
begin
  if not public.workshop_teacher_authorized(p_token) then return jsonb_build_object('ok',false); end if;
  select coalesce(jsonb_agg(full_name order by sort_order,id),'[]'::jsonb) into v_roster from public.workshop_roster;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'name',t.full_name,'firstJoinedAt',t.first_joined_at,'lastSeenAt',t.last_seen_at,'visits',t.visits,
    'progress',coalesce((select jsonb_agg(jsonb_build_object('lessonId',a.lesson_id,'score',a.score,'maxScore',a.max_score,'timeSpentSeconds',a.time_spent_seconds,'answers',a.answers,'updatedAt',a.created_at) order by a.created_at) from public.workshop_attempts a where a.teacher_id=t.id),'[]'::jsonb),
    'rewards',coalesce((select jsonb_agg(jsonb_build_object('awardedAt',r.awarded_at) order by r.awarded_at) from public.workshop_rewards r where r.teacher_id=t.id),'[]'::jsonb)
  ) order by t.last_seen_at desc),'[]'::jsonb) into v_attendees from public.workshop_teachers t;
  return jsonb_build_object('ok',true,'workshop',jsonb_build_object('roster',v_roster,'attendees',v_attendees));
end $$;

create or replace function public.teacher_set_workshop_roster(p_token text,p_names text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text; v_pos integer := 0; v_result jsonb;
begin
  if not public.workshop_teacher_authorized(p_token) then return jsonb_build_object('ok',false); end if;
  foreach v_name in array coalesce(p_names,array[]::text[]) loop
    v_name := regexp_replace(trim(v_name),'\\s+',' ','g');
    if char_length(v_name) between 2 and 80 then
      v_pos := v_pos+1;
      insert into public.workshop_roster(normalized_name,full_name,sort_order)
      values(public.workshop_normalize_name(v_name),v_name,v_pos)
      on conflict(normalized_name) do update set full_name=excluded.full_name,sort_order=excluded.sort_order;
    end if;
  end loop;
  v_result := public.teacher_workshop_dashboard(p_token);
  return v_result;
end $$;

create or replace function public.teacher_award_workshop_star(p_token text,p_attendee_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if not public.workshop_teacher_authorized(p_token) then return jsonb_build_object('ok',false); end if;
  if not exists(select 1 from public.workshop_teachers where id=p_attendee_id) then return jsonb_build_object('ok',false,'message','not_found'); end if;
  insert into public.workshop_rewards(teacher_id) values(p_attendee_id);
  select count(*)::integer into v_count from public.workshop_rewards where teacher_id=p_attendee_id;
  return jsonb_build_object('ok',true,'rewardCount',v_count);
end $$;

revoke all on function public.workshop_normalize_name(text) from public;
revoke all on function public.workshop_session_teacher(text) from public;
revoke all on function public.workshop_teacher_authorized(text) from public;
grant execute on function public.workshop_teacher_join(text) to anon, authenticated;
grant execute on function public.workshop_teacher_portal(text) to anon, authenticated;
grant execute on function public.workshop_record_progress(text,integer,integer,integer,jsonb,text) to anon, authenticated;
grant execute on function public.teacher_workshop_dashboard(text) to anon, authenticated;
grant execute on function public.teacher_set_workshop_roster(text,text[]) to anon, authenticated;
grant execute on function public.teacher_award_workshop_star(text,uuid) to anon, authenticated;
