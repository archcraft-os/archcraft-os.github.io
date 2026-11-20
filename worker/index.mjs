import { timingSafeEqual } from 'node:crypto';

const feedHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
};

async function syncGitHub(env) {
    const query = `query ($login: String!, $after: String) {
        user(login: $login) {
            sponsorshipsAsMaintainer(first: 100, after: $after, activeOnly: true, includePrivate: false) {
                nodes {
                    privacyLevel
                    sponsorEntity {
                        ... on User { login }
                        ... on Organization { login }
                    }
                }
                pageInfo { hasNextPage endCursor }
            }
        }
    }`;

    const sponsors = new Set();
    let after = null;

    do {
        const response = await fetch('https://api.github.com/graphql', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + env.GITHUB_TOKEN,
                'Content-Type': 'application/json',
                'User-Agent': 'Archcraft-Supporters'
            },
            body: JSON.stringify({ query, variables: { login: env.GITHUB_LOGIN, after } })
        });
        if (!response.ok) throw new Error('GitHub API request failed: ' + response.status);
        const result = await response.json();
        const connection = result.data?.user?.sponsorshipsAsMaintainer;
        if (result.errors?.length || !connection) throw new Error('GitHub Sponsors query failed');

        for (const entry of connection.nodes) {
            if (entry?.privacyLevel === 'PUBLIC' && entry.sponsorEntity?.login) {
                sponsors.add(entry.sponsorEntity.login);
            }
        }

        after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
    } while (after);

    await env.DB.prepare(`
        INSERT INTO github_snapshot (id, sponsors, updated_at) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET sponsors = excluded.sponsors, updated_at = excluded.updated_at
    `).bind(JSON.stringify([...sponsors].sort((a, b) => a.localeCompare(b))), new Date().toISOString()).run();
}

async function sha256(value) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function receiveKoFi(request, env) {
    let event;
    try {
        const data = (await request.formData()).get('data');
        event = typeof data === 'string' ? JSON.parse(data) : null;
    } catch {
        return new Response('Invalid webhook', { status: 400 });
    }

    const token = event?.verification_token;
    if (!env.KOFI_VERIFICATION_TOKEN || typeof token !== 'string' ||
        !timingSafeEqual(await sha256(token), await sha256(env.KOFI_VERIFICATION_TOKEN))) {
        return new Response('Unauthorized', { status: 401 });
    }

    const kind = {
        Donation: 'support',
        Subscription: 'support',
        'Shop Order': 'purchase'
    };
    if (!Object.hasOwn(kind, event.type)) return new Response('OK');

    const timestamp = Date.parse(event.timestamp);
    const transaction = event.kofi_transaction_id || event.message_id;
    if (typeof transaction !== 'string' || !Number.isFinite(timestamp)) {
        return new Response('Missing transaction or timestamp', { status: 400 });
    }

    const catalog = env.SHOP_ITEMS ?? {};
    const items = Array.isArray(event.shop_items) ? event.shop_items : [];
    const titles = items.map(item => {
        const code = item?.direct_link_code;
        return typeof code === 'string' && Object.hasOwn(catalog, code) ? catalog[code] : null;
    });
    const item = titles.length && titles.every(Boolean) ? [...new Set(titles)].join(', ') : null;
    const id = Array.from(await sha256(transaction), byte => byte.toString(16).padStart(2, '0')).join('');

    const isPublic = event.is_public === true;
    const publicName = isPublic && typeof event.from_name === 'string'
        ? event.from_name.trim().slice(0, 80) || null
        : null;

    await env.DB.prepare(`
        INSERT INTO kofi_activity (id, occurred_at, kind, item, hidden, public_name)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
    `).bind(
        id,
        new Date(timestamp).toISOString(),
        kind[event.type],
        item,
        isPublic ? 0 : 1,
        publicName
    ).run();

    return new Response('OK');
}

async function readFeed(env) {
    const [snapshot, kofi] = await Promise.all([
        env.DB.prepare('SELECT sponsors, updated_at FROM github_snapshot WHERE id = 1').first(),
        env.DB.prepare(`
            SELECT kind, item, public_name AS name
            FROM kofi_activity WHERE hidden = 0
            ORDER BY occurred_at DESC, id LIMIT 30
        `).all()
    ]);

    const current = snapshot && Date.now() - Date.parse(snapshot.updated_at) < 2 * 60 * 60 * 1000;
    return Response.json({
        github: current ? JSON.parse(snapshot.sponsors) : [],
        githubUpdated: current ? snapshot.updated_at : null,
        kofi: kofi.results
    }, { headers: feedHeaders });
}

export default {
    async fetch(request, env) {
        const path = new URL(request.url).pathname;
        if (request.method === 'GET' && path === '/supporters.json') return readFeed(env);
        if (request.method === 'POST' && path === '/webhooks/kofi') return receiveKoFi(request, env);
        return new Response('Not found', { status: 404 });
    },

    async scheduled(_controller, env) {
        await syncGitHub(env);
    }
};
