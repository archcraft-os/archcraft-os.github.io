(async function () {
    //const search = document.getElementById('past-kofi-search');
    const status = document.getElementById('past-kofi-status');
    const rows = document.getElementById('past-kofi-rows');
    const previous = document.getElementById('past-kofi-prev');
    const next = document.getElementById('past-kofi-next');
    const pageSize = 10;
    const monthYear = new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
    });

    let supporters;
    let matches;
    let page = 0;

    function render() {
        const start = page * pageSize;
        const end = Math.min(start + pageSize, matches.length);
        const fragment = document.createDocumentFragment();

        for (const supporter of matches.slice(start, end)) {
            const row = document.createElement('tr');
            row.insertCell().textContent = supporter.name;
            row.insertCell().textContent = monthYear.format(supporter.timestamp);
            fragment.append(row);
        }

        rows.replaceChildren(fragment);
        status.textContent = matches.length
            ? `Showing ${start + 1}–${end} of ${matches.length.toLocaleString()} supporters`
            : 'No supporters match your search.';
        previous.disabled = page === 0;
        next.disabled = end >= matches.length;
    }

    try {
        const response = await fetch('past-supporters-public.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const archive = await response.json();
        supporters = archive.map(({ name, lastSupportedDateUTC }) => ({
            name,
            timestamp: Date.parse(lastSupportedDateUTC.replace(' ', 'T') + ':00Z')
        })).sort((a, b) => b.timestamp - a.timestamp);

        matches = supporters;
        render();
        //search.disabled = false;
    } catch (error) {
        status.textContent = 'Could not load the past supporters archive.';
        console.error('Past Ko-fi archive:', error);
        return;
    }

    //search.addEventListener('input', () => {
    //    const query = search.value.trim().toLowerCase();
    //    matches = supporters.filter(({ name }) => name.toLowerCase().includes(query));
    //    page = 0;
    //    render();
    //});

    previous.addEventListener('click', () => {
        page -= 1;
        render();
    });

    next.addEventListener('click', () => {
        page += 1;
        render();
    });
}());
