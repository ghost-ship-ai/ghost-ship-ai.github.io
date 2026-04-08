async function loadDashboard() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) {
            document.getElementById('repos-grid').innerHTML =
                '<p style="color: var(--text-muted)">No data yet. Dashboard updates daily after onboarding a repo.</p>';
            return;
        }
        const data = await response.json();
        renderDashboard(data);
    } catch (e) {
        document.getElementById('repos-grid').innerHTML =
            '<p style="color: var(--text-muted)">No data yet. Dashboard updates daily after onboarding a repo.</p>';
    }
}

function renderDashboard(data) {
    document.getElementById('last-updated').textContent =
        `Last updated: ${new Date(data.generated_at).toLocaleString()}`;

    renderRepos(data.repos);
    renderActivity(data.repos);
    renderStats(data.repos);
}

function renderRepos(repos) {
    const grid = document.getElementById('repos-grid');
    grid.innerHTML = repos.map(repo => {
        const ciColor = repo.ci_status === 'success' ? 'green' :
                         repo.ci_status === 'pending' ? 'yellow' : 'red';

        const issueColor = repo.open_issues === 0 ? 'green' :
                           repo.open_issues < 5 ? 'yellow' : 'red';

        const lastCommit = repo.last_commit ? timeAgo(new Date(repo.last_commit)) : 'never';
        const botColor = isRecent(repo.last_commit, 3) ? 'green' :
                         isRecent(repo.last_commit, 7) ? 'yellow' : 'red';

        return `
            <div class="repo-card">
                <h3><a href="https://github.com/${repo.name}" target="_blank">${repo.name}</a></h3>
                <div class="repo-meta">Upstream: ${repo.upstream}</div>
                <div class="status-indicators">
                    <span class="indicator"><span class="dot ${ciColor}"></span>CI</span>
                    <span class="indicator"><span class="dot ${issueColor}"></span>Issues (${repo.open_issues})</span>
                    <span class="indicator"><span class="dot ${botColor}"></span>Bot Active</span>
                    <span class="indicator"><span class="dot ${repo.human_commits === 0 ? 'green' : 'red'}"></span>Human Commits (${repo.human_commits})</span>
                    <span class="indicator"><span class="dot ${repo.latest_release ? 'green' : 'gray'}"></span>Release ${repo.latest_release || 'none'}</span>
                </div>
                <div class="repo-stats">
                    <span>Last commit: ${lastCommit}</span>
                    <span>Total commits: ${repo.total_commits}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderActivity(repos) {
    const feed = document.getElementById('activity-feed');
    const allCommits = repos.flatMap(repo =>
        (repo.recent_commits || []).map(c => ({ ...c, repo: repo.name }))
    ).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);

    if (allCommits.length === 0) {
        feed.innerHTML = '<p style="color: var(--text-muted)">No activity yet.</p>';
        return;
    }

    feed.innerHTML = allCommits.map(c => `
        <div class="activity-item">
            <span class="author">${c.author}</span> — ${c.message}
            <br><span class="time">${c.repo} &middot; ${timeAgo(new Date(c.date))}</span>
        </div>
    `).join('');
}

function renderStats(repos) {
    const grid = document.getElementById('stats-grid');
    const totalCommits = repos.reduce((s, r) => s + (r.total_commits || 0), 0);
    const totalHumanCommits = repos.reduce((s, r) => s + (r.human_commits || 0), 0);
    const totalOpenIssues = repos.reduce((s, r) => s + (r.open_issues || 0), 0);
    const totalClosedIssues = repos.reduce((s, r) => s + (r.closed_issues || 0), 0);

    grid.innerHTML = `
        <div class="stat-card">
            <div class="value">${repos.length}</div>
            <div class="label">Repos Maintained</div>
        </div>
        <div class="stat-card">
            <div class="value">${totalCommits}</div>
            <div class="label">Total Commits</div>
        </div>
        <div class="stat-card">
            <div class="value" style="color: ${totalHumanCommits === 0 ? 'var(--green)' : 'var(--red)'}">${totalHumanCommits}</div>
            <div class="label">Human Commits</div>
        </div>
        <div class="stat-card">
            <div class="value">${totalClosedIssues}</div>
            <div class="label">Issues Addressed</div>
        </div>
        <div class="stat-card">
            <div class="value">${totalOpenIssues}</div>
            <div class="label">Open Issues</div>
        </div>
    `;
}

function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function isRecent(dateStr, days) {
    if (!dateStr) return false;
    const diff = (new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24);
    return diff < days;
}

loadDashboard();
