-- Multi-brand art store: catalogue, server-side pricing, orders and fulfilment events.
--
-- Rules enforced here rather than in the browser:
--   * every row carries brand_id and RLS limits reads to the caller's brand;
--   * clients cannot insert or update orders directly; checkout goes through create_order(),
--     which prices the cart from the price list and ignores any price or finish sent by the client;
--   * payment and fulfilment updates are callable by the service role only (Edge Functions).

create table public.brands (
    id   uuid primary key default gen_random_uuid(),
    slug text not null unique,
    name text not null
);

create table public.brand_members (
    user_id  uuid primary key references auth.users (id) on delete cascade,
    brand_id uuid not null references public.brands (id),
    role     text not null default 'customer' check (role in ('customer', 'staff'))
);

create function public.current_brand_id() returns uuid
language sql stable security definer set search_path = public
as $$ select brand_id from public.brand_members where user_id = auth.uid() $$;

create function public.is_brand_staff() returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role = 'staff' from public.brand_members where user_id = auth.uid()), false) $$;

create table public.products (
    id         uuid primary key default gen_random_uuid(),
    brand_id   uuid not null references public.brands (id),
    sku        text not null,
    title      text not null,
    artist     text not null,
    image_path text not null,
    finish     text not null default 'standard' check (finish in ('standard', 'hand_finished')),
    unique (brand_id, sku),
    unique (id, brand_id)
);

create table public.frames (
    id       uuid primary key default gen_random_uuid(),
    brand_id uuid not null references public.brands (id),
    code     text not null,
    name     text not null,
    unique (brand_id, code),
    unique (id, brand_id)
);

create table public.mats (
    id       uuid primary key default gen_random_uuid(),
    brand_id uuid not null references public.brands (id),
    code     text not null,
    name     text not null,
    unique (brand_id, code),
    unique (id, brand_id)
);

-- One price per item and currency. Hand finish is priced per product.
create table public.price_list (
    brand_id     uuid    not null references public.brands (id),
    item_type    text    not null check (item_type in ('print', 'frame', 'mat', 'hand_finish')),
    item_id      uuid    not null,
    currency     text    not null check (currency in ('USD', 'CAD', 'GBP')),
    amount_minor integer not null check (amount_minor >= 0),
    primary key (item_type, item_id, currency)
);

create table public.shipping_rates (
    brand_id     uuid    not null references public.brands (id),
    country      text    not null check (country in ('US', 'CA', 'GB')),
    currency     text    not null check (currency in ('USD', 'CAD', 'GBP')),
    amount_minor integer not null check (amount_minor >= 0),
    primary key (brand_id, country, currency)
);

create table public.tax_rates (
    country text primary key check (country in ('US', 'CA', 'GB')),
    rate_bp integer not null check (rate_bp between 0 and 5000),
    label   text not null
);

create table public.orders (
    id                uuid primary key default gen_random_uuid(),
    brand_id          uuid not null references public.brands (id),
    user_id           uuid not null references auth.users (id) on delete cascade,
    currency          text not null check (currency in ('USD', 'CAD', 'GBP')),
    ship_country      text not null check (ship_country in ('US', 'CA', 'GB')),
    subtotal_minor    integer not null check (subtotal_minor >= 0),
    shipping_minor    integer not null check (shipping_minor >= 0),
    tax_minor         integer not null check (tax_minor >= 0),
    total_minor       integer not null,
    status            text not null default 'pending_payment'
                      check (status in ('pending_payment', 'paid', 'in_production', 'shipped', 'delivered')),
    payment_intent_id text unique,
    payment_mode      text check (payment_mode in ('stripe_test', 'simulated')),
    tracking_number   text,
    tracking_url      text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    check (total_minor = subtotal_minor + shipping_minor + tax_minor),
    unique (id, brand_id)
);
create index orders_user on public.orders (user_id);

create table public.order_items (
    id                uuid primary key default gen_random_uuid(),
    order_id          uuid not null,
    brand_id          uuid not null,
    product_id        uuid not null,
    frame_id          uuid,
    mat_id            uuid,
    quantity          integer not null check (quantity between 1 and 20),
    finish            text not null check (finish in ('standard', 'hand_finished')),
    fulfilment_route  text not null check (fulfilment_route in ('prodigi', 'studio')),
    unit_print_minor  integer not null,
    unit_frame_minor  integer not null,
    unit_mat_minor    integer not null,
    unit_finish_minor integer not null,
    line_total_minor  integer not null,
    foreign key (order_id, brand_id) references public.orders (id, brand_id) on delete cascade,
    foreign key (product_id, brand_id) references public.products (id, brand_id),
    foreign key (frame_id, brand_id) references public.frames (id, brand_id),
    foreign key (mat_id, brand_id) references public.mats (id, brand_id),
    -- Hand-finished pieces always go to the in-house studio, never to the print partner.
    check ((finish = 'hand_finished') = (fulfilment_route = 'studio')),
    check (line_total_minor = quantity * (unit_print_minor + unit_frame_minor + unit_mat_minor + unit_finish_minor))
);
create index order_items_order on public.order_items (order_id);

-- Webhook events are stored once by their ID; replays are no-ops.
create table public.fulfilment_events (
    event_id    text primary key,
    order_id    uuid not null references public.orders (id) on delete cascade,
    event_type  text not null,
    payload     jsonb not null,
    outcome     text not null,
    received_at timestamptz not null default now()
);
create index fulfilment_events_order on public.fulfilment_events (order_id);

create table public.order_status_history (
    id          bigint generated always as identity primary key,
    order_id    uuid not null references public.orders (id) on delete cascade,
    from_status text,
    to_status   text not null,
    source      text not null,
    event_id    text references public.fulfilment_events (event_id),
    at          timestamptz not null default now()
);
create index order_status_history_order on public.order_status_history (order_id);

-- Secrets used only by Edge Functions (webhook signing key). Not exposed through the API.
create schema if not exists private;
create table private.app_secrets (
    name  text primary key,
    value text not null
);

-- ---------------------------------------------------------------------------
-- Row-level security: read your own brand, nothing else. No direct writes.
-- ---------------------------------------------------------------------------

alter table public.brands enable row level security;
alter table public.brand_members enable row level security;
alter table public.products enable row level security;
alter table public.frames enable row level security;
alter table public.mats enable row level security;
alter table public.price_list enable row level security;
alter table public.shipping_rates enable row level security;
alter table public.tax_rates enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.fulfilment_events enable row level security;
alter table public.order_status_history enable row level security;

create policy brands_read on public.brands for select to authenticated
    using (id = public.current_brand_id());
create policy brand_members_read on public.brand_members for select to authenticated
    using (user_id = auth.uid());
create policy products_read on public.products for select to authenticated
    using (brand_id = public.current_brand_id());
create policy frames_read on public.frames for select to authenticated
    using (brand_id = public.current_brand_id());
create policy mats_read on public.mats for select to authenticated
    using (brand_id = public.current_brand_id());
create policy price_list_read on public.price_list for select to authenticated
    using (brand_id = public.current_brand_id());
create policy shipping_rates_read on public.shipping_rates for select to authenticated
    using (brand_id = public.current_brand_id());
create policy tax_rates_read on public.tax_rates for select to authenticated
    using (true);
-- Customers see their own orders; brand staff see every order of their brand.
create policy orders_read on public.orders for select to authenticated
    using (brand_id = public.current_brand_id() and (user_id = auth.uid() or public.is_brand_staff()));
create policy order_items_read on public.order_items for select to authenticated
    using (brand_id = public.current_brand_id()
           and exists (select 1 from public.orders o where o.id = order_id));
create policy fulfilment_events_read on public.fulfilment_events for select to authenticated
    using (exists (select 1 from public.orders o where o.id = order_id));
create policy order_status_history_read on public.order_status_history for select to authenticated
    using (exists (select 1 from public.orders o where o.id = order_id));

-- ---------------------------------------------------------------------------
-- Pricing: one function, used for both the quote the customer sees and the order they pay for.
-- ---------------------------------------------------------------------------

create function public._list_price(p_type text, p_id uuid, p_currency text) returns integer
language plpgsql stable set search_path = public
as $$
declare
    v_amount integer;
begin
    select amount_minor into v_amount
    from public.price_list
    where item_type = p_type and item_id = p_id and currency = p_currency;
    if not found then
        raise exception 'no % price for % in %', p_type, p_id, p_currency;
    end if;
    return v_amount;
end;
$$;

-- Prices a cart for one brand. Only product_id, frame_id, mat_id and quantity are read from
-- the request; prices, finish and surcharges always come from the database.
create function public._price_order(p_brand uuid, p_items jsonb, p_currency text, p_country text)
returns jsonb
language plpgsql stable set search_path = public
as $$
declare
    v_item     jsonb;
    v_product  public.products;
    v_qty      integer;
    v_frame_id uuid;
    v_mat_id   uuid;
    v_print    integer;
    v_frame    integer;
    v_mat      integer;
    v_finish   integer;
    v_line     integer;
    v_lines    jsonb := '[]'::jsonb;
    v_subtotal integer := 0;
    v_shipping integer;
    v_rate     integer;
    v_label    text;
    v_tax      integer;
begin
    if p_brand is null then
        raise exception 'not signed in to a store' using errcode = '42501';
    end if;
    if p_currency is null or p_currency not in ('USD', 'CAD', 'GBP') then
        raise exception 'unsupported currency %', p_currency;
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
        raise exception 'cart is empty';
    end if;

    for v_item in select value from jsonb_array_elements(p_items) loop
        select * into v_product
        from public.products
        where id = (v_item ->> 'product_id')::uuid and brand_id = p_brand;
        if not found then
            raise exception 'unknown product %', v_item ->> 'product_id';
        end if;

        v_qty := coalesce((v_item ->> 'quantity')::integer, 1);
        if v_qty not between 1 and 20 then
            raise exception 'quantity must be between 1 and 20';
        end if;

        v_frame_id := nullif(v_item ->> 'frame_id', '')::uuid;
        v_mat_id := nullif(v_item ->> 'mat_id', '')::uuid;
        if v_frame_id is not null and not exists (
            select 1 from public.frames where id = v_frame_id and brand_id = p_brand) then
            raise exception 'unknown frame %', v_frame_id;
        end if;
        if v_mat_id is not null and not exists (
            select 1 from public.mats where id = v_mat_id and brand_id = p_brand) then
            raise exception 'unknown mat %', v_mat_id;
        end if;

        v_print := public._list_price('print', v_product.id, p_currency);
        v_frame := case when v_frame_id is null then 0 else public._list_price('frame', v_frame_id, p_currency) end;
        v_mat := case when v_mat_id is null then 0 else public._list_price('mat', v_mat_id, p_currency) end;
        v_finish := case when v_product.finish = 'hand_finished'
                         then public._list_price('hand_finish', v_product.id, p_currency) else 0 end;
        v_line := v_qty * (v_print + v_frame + v_mat + v_finish);
        v_subtotal := v_subtotal + v_line;

        v_lines := v_lines || jsonb_build_object(
            'product_id', v_product.id,
            'title', v_product.title,
            'frame_id', v_frame_id,
            'mat_id', v_mat_id,
            'quantity', v_qty,
            'finish', v_product.finish,
            'fulfilment_route', case when v_product.finish = 'hand_finished' then 'studio' else 'prodigi' end,
            'unit_print_minor', v_print,
            'unit_frame_minor', v_frame,
            'unit_mat_minor', v_mat,
            'unit_finish_minor', v_finish,
            'line_total_minor', v_line);
    end loop;

    select amount_minor into v_shipping
    from public.shipping_rates
    where brand_id = p_brand and country = p_country and currency = p_currency;
    if not found then
        raise exception 'no shipping to % in %', p_country, p_currency;
    end if;

    select rate_bp, label into v_rate, v_label from public.tax_rates where country = p_country;
    if not found then
        raise exception 'no tax rate for %', p_country;
    end if;
    -- Tax on goods and shipping, rounded half away from zero to the minor unit.
    v_tax := round((v_subtotal + v_shipping) * v_rate / 10000.0)::integer;

    return jsonb_build_object(
        'currency', p_currency,
        'ship_country', p_country,
        'lines', v_lines,
        'subtotal_minor', v_subtotal,
        'shipping_minor', v_shipping,
        'tax_minor', v_tax,
        'tax_label', v_label,
        'tax_rate_bp', v_rate,
        'total_minor', v_subtotal + v_shipping + v_tax);
end;
$$;

create function public.quote_order(p_items jsonb, p_currency text, p_country text) returns jsonb
language sql stable security definer set search_path = public
as $$ select public._price_order(public.current_brand_id(), p_items, p_currency, p_country) $$;

create function public.create_order(p_items jsonb, p_currency text, p_country text) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
    v_brand uuid := public.current_brand_id();
    v_quote jsonb;
    v_order uuid;
begin
    if auth.uid() is null then
        raise exception 'sign in required' using errcode = '42501';
    end if;
    v_quote := public._price_order(v_brand, p_items, p_currency, p_country);

    insert into public.orders (brand_id, user_id, currency, ship_country,
                               subtotal_minor, shipping_minor, tax_minor, total_minor)
    values (v_brand, auth.uid(), p_currency, p_country,
            (v_quote ->> 'subtotal_minor')::integer, (v_quote ->> 'shipping_minor')::integer,
            (v_quote ->> 'tax_minor')::integer, (v_quote ->> 'total_minor')::integer)
    returning id into v_order;

    insert into public.order_items (order_id, brand_id, product_id, frame_id, mat_id, quantity, finish,
                                    fulfilment_route, unit_print_minor, unit_frame_minor, unit_mat_minor,
                                    unit_finish_minor, line_total_minor)
    select v_order, v_brand, (l ->> 'product_id')::uuid, (l ->> 'frame_id')::uuid, (l ->> 'mat_id')::uuid,
           (l ->> 'quantity')::integer, l ->> 'finish', l ->> 'fulfilment_route',
           (l ->> 'unit_print_minor')::integer, (l ->> 'unit_frame_minor')::integer,
           (l ->> 'unit_mat_minor')::integer, (l ->> 'unit_finish_minor')::integer,
           (l ->> 'line_total_minor')::integer
    from jsonb_array_elements(v_quote -> 'lines') as l;

    insert into public.order_status_history (order_id, from_status, to_status, source)
    values (v_order, null, 'pending_payment', 'checkout');

    return v_quote || jsonb_build_object('order_id', v_order);
end;
$$;

-- ---------------------------------------------------------------------------
-- Service-role only: payment result and fulfilment webhooks.
-- ---------------------------------------------------------------------------

create function public._status_rank(p_status text) returns integer
language sql immutable set search_path = ''
as $$ select array_position(array['pending_payment', 'paid', 'in_production', 'shipped', 'delivered'], p_status) $$;

create function public.record_payment(p_order_id uuid, p_payment_intent_id text, p_mode text, p_succeeded boolean)
returns text
language plpgsql security definer set search_path = public
as $$
declare
    v_status text;
begin
    select status into v_status from public.orders where id = p_order_id for update;
    if not found then
        raise exception 'unknown order %', p_order_id;
    end if;
    update public.orders
    set payment_intent_id = p_payment_intent_id, payment_mode = p_mode, updated_at = now(),
        status = case when p_succeeded and v_status = 'pending_payment' then 'paid' else status end
    where id = p_order_id;
    if p_succeeded and v_status = 'pending_payment' then
        insert into public.order_status_history (order_id, from_status, to_status, source)
        values (p_order_id, v_status, 'paid', 'payment');
        return 'paid';
    end if;
    return v_status;
end;
$$;

-- Stores a fulfilment event once and moves the order forward at most once per event.
create function public.apply_fulfilment_event(p_event_id text, p_event_type text, p_order_id uuid, p_payload jsonb)
returns text
language plpgsql security definer set search_path = public
as $$
declare
    v_current text;
    v_target  text;
    v_outcome text;
begin
    select status into v_current from public.orders where id = p_order_id for update;
    if not found then
        raise exception 'unknown order %', p_order_id;
    end if;
    if exists (select 1 from public.fulfilment_events where event_id = p_event_id) then
        return 'duplicate';
    end if;

    v_target := case p_event_type
        when 'order.in_production' then 'in_production'
        when 'shipment.dispatched' then 'shipped'
        when 'order.delivered' then 'delivered'
    end;
    v_outcome := case
        when v_target is null then 'unhandled_type'
        when public._status_rank(v_current) < public._status_rank('paid') then 'ignored_unpaid'
        when public._status_rank(v_target) <= public._status_rank(v_current) then 'ignored_not_forward'
        else 'applied'
    end;

    insert into public.fulfilment_events (event_id, order_id, event_type, payload, outcome)
    values (p_event_id, p_order_id, p_event_type, p_payload, v_outcome)
    on conflict (event_id) do nothing;
    if not found then
        return 'duplicate';
    end if;

    if v_outcome = 'applied' then
        update public.orders
        set status = v_target, updated_at = now(),
            tracking_number = coalesce(p_payload #>> '{data,shipment,trackingNumber}', tracking_number),
            tracking_url = coalesce(p_payload #>> '{data,shipment,trackingUrl}', tracking_url)
        where id = p_order_id;
        insert into public.order_status_history (order_id, from_status, to_status, source, event_id)
        values (p_order_id, v_current, v_target, 'fulfilment_webhook', p_event_id);
    end if;
    return v_outcome;
end;
$$;

create function public.get_app_secret(p_name text) returns text
language sql stable security definer set search_path = private
as $$ select value from private.app_secrets where name = p_name $$;

-- ---------------------------------------------------------------------------
-- Privileges: browsers (anon/authenticated) read through RLS; writes go through functions.
-- ---------------------------------------------------------------------------

revoke all on public.brands, public.brand_members, public.products, public.frames, public.mats,
    public.price_list, public.shipping_rates, public.tax_rates, public.orders, public.order_items,
    public.fulfilment_events, public.order_status_history from anon, authenticated;
grant select on public.brands, public.brand_members, public.products, public.frames, public.mats,
    public.price_list, public.shipping_rates, public.tax_rates, public.orders, public.order_items,
    public.fulfilment_events, public.order_status_history to authenticated;
revoke all on schema private from public, anon, authenticated;

revoke execute on function public.current_brand_id(), public.is_brand_staff(),
    public._list_price(text, uuid, text), public._price_order(uuid, jsonb, text, text),
    public.quote_order(jsonb, text, text), public.create_order(jsonb, text, text),
    public._status_rank(text), public.record_payment(uuid, text, text, boolean),
    public.apply_fulfilment_event(text, text, uuid, jsonb), public.get_app_secret(text)
    from public, anon, authenticated;
grant execute on function public.current_brand_id(), public.is_brand_staff(),
    public.quote_order(jsonb, text, text), public.create_order(jsonb, text, text)
    to authenticated;
grant execute on function public.record_payment(uuid, text, text, boolean),
    public.apply_fulfilment_event(text, text, uuid, jsonb), public.get_app_secret(text)
    to service_role;
