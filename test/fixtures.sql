insert into auth.users (id, email) values
    ('aaaaaaaa-0000-4000-8000-000000000001', 'nl.customer@example.com'),
    ('aaaaaaaa-0000-4000-8000-000000000002', 'nl.customer2@example.com'),
    ('aaaaaaaa-0000-4000-8000-000000000003', 'nl.staff@example.com'),
    ('bbbbbbbb-0000-4000-8000-000000000001', 'sv.customer@example.com'),
    ('bbbbbbbb-0000-4000-8000-000000000002', 'sv.staff@example.com');

insert into public.brand_members (user_id, brand_id, role) values
    ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'customer'),
    ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'customer'),
    ('aaaaaaaa-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'staff'),
    ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'customer'),
    ('bbbbbbbb-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'staff');

insert into private.app_secrets (name, value) values ('prodigi_webhook_secret', 'test-webhook-secret');
