-- Circle Calendar v0.5.0: exact event map positions.
alter table public.events add column if not exists location_lat double precision;
alter table public.events add column if not exists location_lng double precision;
alter table public.events add column if not exists place_id text;
