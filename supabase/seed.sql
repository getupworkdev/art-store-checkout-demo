-- Fictional catalogue for two fictional brands. Artwork images are generated gradients.

insert into public.brands (id, slug, name) values
    ('11111111-1111-4111-8111-111111111111', 'northlight', 'Northlight Prints'),
    ('22222222-2222-4222-8222-222222222222', 'studio-verde', 'Studio Verde');

insert into public.products (id, brand_id, sku, title, artist, image_path, finish) values
    ('1a000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'NL-001', 'Harbour at Dusk', 'M. Arden', '/art/nl-001.svg', 'standard'),
    ('1a000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'NL-002', 'Aurora Field', 'T. Vale', '/art/nl-002.svg', 'standard'),
    ('1a000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'NL-003', 'Quiet Pines', 'R. Holm', '/art/nl-003.svg', 'standard'),
    ('1a000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'NL-004', 'Lantern Study', 'M. Arden', '/art/nl-004.svg', 'hand_finished'),
    ('2a000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'SV-001', 'Fern Cascade', 'L. Okoro', '/art/sv-001.svg', 'standard'),
    ('2a000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'SV-002', 'Olive Grove', 'P. Sand', '/art/sv-002.svg', 'standard'),
    ('2a000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'SV-003', 'Moss Garden', 'L. Okoro', '/art/sv-003.svg', 'standard'),
    ('2a000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'SV-004', 'Green Hour', 'P. Sand', '/art/sv-004.svg', 'hand_finished');

insert into public.frames (id, brand_id, code, name) values
    ('1f000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'oak', 'Natural oak'),
    ('1f000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'black', 'Black ash'),
    ('1f000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'white', 'White wood'),
    ('2f000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'oak', 'Natural oak'),
    ('2f000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'walnut', 'Walnut');

insert into public.mats (id, brand_id, code, name) values
    ('1d000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'white', 'Bright white mat'),
    ('1d000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'ivory', 'Ivory mat'),
    ('2d000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'linen', 'Linen mat');

-- Base prices in US cents, converted with fixed demo factors and rounded to whole units.
with base (item_type, item_id, usd) as (
    values
        ('print', '1a000000-0000-4000-8000-000000000001'::uuid, 4500),
        ('print', '1a000000-0000-4000-8000-000000000002'::uuid, 5200),
        ('print', '1a000000-0000-4000-8000-000000000003'::uuid, 3900),
        ('print', '1a000000-0000-4000-8000-000000000004'::uuid, 6800),
        ('hand_finish', '1a000000-0000-4000-8000-000000000004'::uuid, 8500),
        ('frame', '1f000000-0000-4000-8000-000000000001'::uuid, 3500),
        ('frame', '1f000000-0000-4000-8000-000000000002'::uuid, 3000),
        ('frame', '1f000000-0000-4000-8000-000000000003'::uuid, 3000),
        ('mat', '1d000000-0000-4000-8000-000000000001'::uuid, 1200),
        ('mat', '1d000000-0000-4000-8000-000000000002'::uuid, 1400),
        ('print', '2a000000-0000-4000-8000-000000000001'::uuid, 4200),
        ('print', '2a000000-0000-4000-8000-000000000002'::uuid, 4800),
        ('print', '2a000000-0000-4000-8000-000000000003'::uuid, 3600),
        ('print', '2a000000-0000-4000-8000-000000000004'::uuid, 7200),
        ('hand_finish', '2a000000-0000-4000-8000-000000000004'::uuid, 9000),
        ('frame', '2f000000-0000-4000-8000-000000000001'::uuid, 3600),
        ('frame', '2f000000-0000-4000-8000-000000000002'::uuid, 4400),
        ('mat', '2d000000-0000-4000-8000-000000000001'::uuid, 1300)
),
fx (currency, factor) as (values ('USD', 1.0), ('CAD', 1.36), ('GBP', 0.79))
insert into public.price_list (brand_id, item_type, item_id, currency, amount_minor)
select case when left(b.item_id::text, 1) = '1' then '11111111-1111-4111-8111-111111111111'::uuid
            else '22222222-2222-4222-8222-222222222222'::uuid end,
       b.item_type, b.item_id, fx.currency, (round(b.usd * fx.factor / 100.0) * 100)::integer
from base b cross join fx;

with rates (country, usd) as (values ('US', 1200), ('CA', 1800), ('GB', 2200)),
fx (currency, factor) as (values ('USD', 1.0), ('CAD', 1.36), ('GBP', 0.79))
insert into public.shipping_rates (brand_id, country, currency, amount_minor)
select b.id, r.country, fx.currency, (round(r.usd * fx.factor / 100.0) * 100)::integer
from public.brands b cross join rates r cross join fx;

insert into public.tax_rates (country, rate_bp, label) values
    ('US', 700, 'Sales tax (demo flat 7%)'),
    ('CA', 1300, 'HST (demo 13%)'),
    ('GB', 2000, 'VAT 20%');
