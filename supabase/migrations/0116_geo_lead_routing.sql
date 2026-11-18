-- Geography-based lead routing.
--
-- route_lead() (0100) matched a user's region name as a whole word inside the
-- lead's pickup/destination text, so a "China" region only caught leads whose
-- address literally contained "China" — "Grand Hyatt Shanghai" or "Beijing
-- Capital Airport" fell through to the open pool, and "New York, NY, USA"
-- caught every address containing "USA".
--
-- Now the app resolves each lead endpoint and each region through Google
-- (lib/geoLocate.ts) and the trigger compares real geography:
--   * country region    ("China")         -> endpoint in that country        (level 1)
--   * admin_area region ("Scotland, UK")  -> endpoint in that state/area     (level 2)
--   * locality region   ("London, UK")    -> endpoint within radius_km of it (level 3)
-- Pickup and destination both count. When several people match, only the
-- most specific level counts (a London person beats a United Kingdom person
-- for a London lead); still two or more people at that level -> open pool.
--
-- Fallback: a region Google can't place ("Caribbean"), a region not yet
-- classified, or a lead endpoint that couldn't be geocoded uses the old
-- word match (lead_route_region_matches from 0100) at level 1 — so applying
-- this before any data is classified behaves exactly like today.

alter table user_regions
  add column if not exists geo_type text check (geo_type in ('country', 'admin_area', 'locality')),
  add column if not exists country_code text,
  add column if not exists admin_area text,
  add column if not exists radius_km numeric not null default 50 check (radius_km > 0),
  add column if not exists geo_checked_at timestamptz;

alter table leads
  add column if not exists pickup_country_code text,
  add column if not exists pickup_admin_area text,
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision,
  add column if not exists destination_country_code text,
  add column if not exists destination_admin_area text,
  add column if not exists destination_lat double precision,
  add column if not exists destination_lng double precision,
  add column if not exists routing_note text;

create or replace function geo_distance_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- How specifically one region matches one lead endpoint: 0 = no match.
create or replace function lead_region_match_level(
  ur user_regions,
  place_text text,
  cc text,
  admin text,
  lat double precision,
  lng double precision
)
returns int
language sql
stable
as $$
  select case
    when place_text is null or trim(place_text) = '' then 0
    when ur.geo_type is not null and cc is not null then
      case ur.geo_type
        when 'country' then
          case when upper(ur.country_code) = upper(cc) then 1 else 0 end
        when 'admin_area' then
          case when upper(ur.country_code) = upper(cc) and lower(ur.admin_area) = lower(coalesce(admin, '')) then 2 else 0 end
        when 'locality' then
          case when ur.lat is not null and ur.lng is not null and lat is not null and lng is not null
                    and geo_distance_km(ur.lat, ur.lng, lat, lng) <= ur.radius_km then 3 else 0 end
        else 0
      end
    when lead_route_region_matches(place_text, ur.region) then 1
    else 0
  end;
$$;

create or replace function route_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level int;
  v_count int;
  v_candidate uuid;
  v_regions text;
  v_name text;
begin
  if new.status <> 'new' then
    return new;
  end if;

  with m as (
    select
      ur.user_id,
      ur.region,
      greatest(
        lead_region_match_level(ur, new.pickup_text, new.pickup_country_code, new.pickup_admin_area, new.pickup_lat, new.pickup_lng),
        lead_region_match_level(ur, new.destination_text, new.destination_country_code, new.destination_admin_area, new.destination_lat, new.destination_lng)
      ) as lvl
    from user_regions ur
    join profiles p on p.id = ur.user_id
    where p.tenant_id = new.tenant_id
      and p.status = 'active'
  ),
  best as (
    select max(lvl) as lvl from m where lvl > 0
  )
  select b.lvl, count(distinct m.user_id), (array_agg(distinct m.user_id))[1], string_agg(distinct m.region, ', ')
    into v_level, v_count, v_candidate, v_regions
  from m
  join best b on m.lvl = b.lvl
  group by b.lvl;

  if v_count = 1 then
    select full_name into v_name from profiles where id = v_candidate;
    new.assigned_user_id := v_candidate;
    new.status := 'assigned';
    new.claimed_at := now();
    new.routing_note := format('Auto-assigned to %s — matches their region "%s"', coalesce(v_name, 'user'), v_regions);
  elsif coalesce(v_count, 0) > 1 then
    new.status := 'open_pool';
    new.routing_note := format('Open pool — %s people cover this area (%s)', v_count, v_regions);
  else
    new.status := 'open_pool';
    new.routing_note := 'Open pool — no one''s region covers this pickup or destination';
  end if;

  return new;
end;
$$;
