(async function () {
    const feed = document.getElementById('supporters-feed');
    const status = document.getElementById('supporters-status');
    const github = document.getElementById('github-supporters');
    const kofi = document.getElementById('kofi-supporters');

    function append(list, text) {
        const row = document.createElement('li');
        row.textContent = text;
        list.append(row);
        return row;
    }

    if (!feed.dataset.feedUrl) {
        status.textContent = 'The supporters feed is coming soon.';
        return;
    }

    status.textContent = 'Loading supporters…';
    try {
        const response = await fetch(feed.dataset.feedUrl, { credentials: 'omit' });
        if (!response.ok) throw new Error('Feed unavailable');
        const data = await response.json();
        const sponsors = data.github.filter(login => /^[a-z\d-]{1,39}$/i.test(login));

        for (const login of sponsors) {
            const row = append(github, '');
            const link = document.createElement('a');
            link.href = 'https://github.com/' + login;
            link.textContent = '@' + login;
            row.append(link, ' sponsors Archcraft on GitHub.');
        }
        if (!sponsors.length) {
            append(github, data.githubUpdated ? 'No public sponsors to display.' : 'GitHub sponsors will appear after the first sync.');
        }

        for (const event of data.kofi) {
            const name = event.name || 'An anonymous supporter';
            const action = event.kind === 'purchase'
                ? ' purchased ' + (event.item || 'an item') + ' from the Archcraft Ko-fi Shop.'
                : ' supported Archcraft on Ko-fi.';
            append(kofi, name + action);
        }
        if (!data.kofi.length) append(kofi, 'No Ko-fi activity to display yet.');
        status.textContent = '';
    } catch {
        github.replaceChildren();
        kofi.replaceChildren();
        status.textContent = 'Supporter activity is temporarily unavailable.';
    }
}());
