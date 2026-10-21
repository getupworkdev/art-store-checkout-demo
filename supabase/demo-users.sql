-- Hosted demo only: two public demo shoppers (one per brand) and a random webhook secret.
-- Run once against the Supabase project after the migration and seed.

with users (id, email, password, brand_id) as (
    values
        ('5a000000-0000-4000-8000-000000000001'::uuid, 'northlight.demo@example.com', 'northlight-demo-2026', '11111111-1111-4111-8111-111111111111'::uuid),
        ('5b000000-0000-4000-8000-000000000001'::uuid, 'verde.demo@example.com', 'verde-demo-2026', '22222222-2222-4222-8222-222222222222'::uuid)
),
created as (
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
           extensions.crypt(password, extensions.gen_salt('bf')), now(),
           '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
    from users
    returning id
),
identities as (
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
           'email', now(), now(), now()
    from users u join created c on c.id = u.id
    returning user_id
)
insert into public.brand_members (user_id, brand_id, role)
select u.id, u.brand_id, 'customer' from users u join identities i on i.user_id = u.id;

insert into private.app_secrets (name, value)
values ('prodigi_webhook_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;
