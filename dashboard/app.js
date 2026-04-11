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
    renderCosts(data.repos);
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

function renderCosts(repos) {
    const statsGrid = document.getElementById('cost-stats');
    const breakdown = document.getElementById('cost-breakdown');

    const reposWithCosts = repos.filter(r => r.costs);
    if (reposWithCosts.length === 0) {
        statsGrid.innerHTML = '<div class="stat-card"><div class="value" style="font-size:1.2rem; color: var(--text-muted)">No cost data yet</div><div class="label">Costs appear after issues complete</div></div>';
        breakdown.innerHTML = '';
        return;
    }

    const totalUsd = reposWithCosts.reduce((s, r) => s + (r.costs.total_usd || 0), 0);
    const allIssues = reposWithCosts.flatMap(r =>
        Object.entries(r.costs.issues || {}).map(([num, data]) => ({ num, ...data, repo: r.name }))
    );
    const mergedIssues = allIssues.filter(i => i.outcome === 'merged');
    const avgPerMerge = mergedIssues.length > 0
        ? mergedIssues.reduce((s, i) => s + i.total_usd, 0) / mergedIssues.length : 0;

    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="value">$${totalUsd.toFixed(2)}</div>
            <div class="label">Total Spend</div>
        </div>
        <div class="stat-card">
            <div class="value">$${avgPerMerge.toFixed(2)}</div>
            <div class="label">Avg Cost / Merged Issue</div>
        </div>
        <div class="stat-card">
            <div class="value">${allIssues.length}</div>
            <div class="label">Issues Tracked</div>
        </div>
        <div class="stat-card">
            <div class="value" style="color: ${mergedIssues.length > 0 ? 'var(--green)' : 'var(--text-muted)'}">${mergedIssues.length}/${allIssues.length}</div>
            <div class="label">Merged / Total</div>
        </div>
    `;

    // Per-issue breakdown table
    if (allIssues.length > 0) {
        const rows = allIssues
            .sort((a, b) => parseInt(b.num) - parseInt(a.num))
            .map(i => {
                const outcomeColor = i.outcome === 'merged' ? 'var(--green)' :
                                     i.outcome === 'failed' ? 'var(--red)' : 'var(--yellow)';
                const prLink = i.pr_number
                    ? `<a href="https://github.com/${i.repo}/pull/${i.pr_number}" target="_blank">#${i.pr_number}</a>`
                    : '—';
                return `<tr>
                    <td><a href="https://github.com/${i.repo}/issues/${i.num}" target="_blank">#${i.num}</a></td>
                    <td>${i.repo.split('/')[1]}</td>
                    <td>$${i.total_usd.toFixed(2)}</td>
                    <td>${i.phases} phases</td>
                    <td style="color: ${outcomeColor}">${i.outcome}</td>
                    <td>${prLink}</td>
                </tr>`;
            }).join('');

        breakdown.innerHTML = `
            <table class="cost-table">
                <thead><tr>
                    <th>Issue</th><th>Repo</th><th>Cost</th><th>Phases</th><th>Outcome</th><th>PR</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }
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
