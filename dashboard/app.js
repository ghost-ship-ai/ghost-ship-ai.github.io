let dashboardData = null;

async function loadData() {
    try {
        const res = await fetch('data.json');
        if (!res.ok) throw new Error(res.statusText);
        dashboardData = await res.json();
    } catch {
        dashboardData = { generated_at: null, repos: [] };
    }
    route();
}

// ========== ROUTER ==========

function route() {
    const hash = location.hash || '#/';
    const app = document.getElementById('app');

    const repoMatch = hash.match(/^#\/repo\/(.+)$/);
    if (repoMatch) {
        const name = decodeURIComponent(repoMatch[1]);
        const repo = dashboardData.repos.find(r =>
            r.name === name || r.name.split('/')[1] === name
        );
        if (repo) {
            app.innerHTML = renderForkDetail(repo);
            attachForkDetailEvents(repo);
        } else {
            app.innerHTML = `<div class="page"><div class="empty-state">Repository not found.</div></div>`;
        }
    } else {
        app.innerHTML = renderHome();
        attachHomeEvents();
    }

    window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);

// ========== HELPERS ==========

function timeAgo(dateStr) {
    if (!dateStr) return 'never';
    const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 2592000)}mo ago`;
}

function formatCost(usd) {
    if (usd === 0 || usd == null) return '$0.00';
    if (usd < 0.01) return '<$0.01';
    return `$${usd.toFixed(2)}`;
}

function formatCostPrecise(usd) {
    if (usd === 0 || usd == null) return '$0.0000';
    return `$${usd.toFixed(4)}`;
}

function ciDotClass(status) {
    if (status === 'success') return 'green';
    if (status === 'pending') return 'yellow';
    if (status === 'failure') return 'red';
    return 'gray';
}

function outcomeBadge(outcome) {
    const map = {
        merged: 'badge-merged',
        failed: 'badge-failed',
        planned: 'badge-planned',
        in_progress: 'badge-in-progress',
    };
    const label = outcome === 'in_progress' ? 'In Progress' : outcome;
    return `<span class="badge ${map[outcome] || 'badge-closed'}">${label}</span>`;
}

function issueStateBadge(state, outcome) {
    if (outcome === 'merged') return outcomeBadge('merged');
    if (outcome === 'failed') return outcomeBadge('failed');
    if (outcome === 'planned') return outcomeBadge('planned');
    if (outcome === 'in_progress') return outcomeBadge('in_progress');
    if (state === 'open') return `<span class="badge badge-open">Open</span>`;
    return `<span class="badge badge-closed">Closed</span>`;
}

function formatTokens(n) {
    if (!n) return '0';
    if (n > 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n > 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return `${n}`;
}

function phaseName(phase) {
    const map = {
        plan: 'Plan',
        plan_fallback: 'Plan (fallback)',
        fix: 'Fix',
        fix_outcome: 'Fix Outcome',
        review_firstmate: 'Review (First Mate)',
        review_bosun: 'Review (Bosun)',
        address_review: 'Address Review',
        merged: 'Merged',
    };
    return map[phase] || phase;
}

function phaseBarClass(phase) {
    if (phase.startsWith('plan')) return 'plan';
    if (phase.startsWith('fix')) return 'fix';
    if (phase.startsWith('review')) return 'review';
    if (phase.startsWith('address')) return 'address';
    return 'other';
}

function shortName(fullName) {
    return fullName.split('/').pop();
}

// ========== HOME PAGE ==========

function renderHome() {
    const repos = dashboardData.repos;
    const totalIssuesClosed = repos.reduce((s, r) => s + (r.closed_issues || 0), 0);
    const totalPRsMerged = repos.reduce((s, r) => s + (r.prs?.merged || 0), 0);
    const totalCost = repos.reduce((s, r) => s + (r.costs?.total_usd || 0), 0);
    const totalHuman = repos.reduce((s, r) => s + (r.human_commits || 0), 0);

    const repoCards = repos.map(renderRepoCard).join('');
    const costSummary = renderCostSummary(repos, totalCost);
    const updatedAt = dashboardData.generated_at
        ? `Updated ${timeAgo(dashboardData.generated_at)}`
        : '';

    return `
        <div class="page">
            <div class="page-header">
                <div class="page-title">Dashboard</div>
                <div class="page-subtitle">Live analytics across all maintained forks.</div>
                <div class="updated-at">${updatedAt}</div>
            </div>

            <div class="stats-row">
                <div class="stat-card">
                    <div class="stat-value">${repos.length}</div>
                    <div class="stat-label">Repos</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${totalIssuesClosed}</div>
                    <div class="stat-label">Issues Resolved</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${totalPRsMerged}</div>
                    <div class="stat-label">PRs Merged</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${formatCost(totalCost)}</div>
                    <div class="stat-label">Total Cost</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value ${totalHuman === 0 ? 'zero' : 'bad'}">${totalHuman}</div>
                    <div class="stat-label">Human Commits</div>
                </div>
            </div>

            <div class="section-label">Maintained Repos</div>
            <div class="repos-grid">${repoCards || '<div class="empty-state">No repos onboarded yet.</div>'}</div>

            ${costSummary}
        </div>
    `;
}

function renderRepoCard(repo) {
    const costs = repo.costs || {};
    const prs = repo.prs || {};
    const slug = shortName(repo.name);

    return `
        <div class="repo-card" data-repo="${slug}">
            <div class="repo-card-header">
                <span class="repo-card-name">${slug}</span>
                <span class="repo-card-ci">
                    <span class="ci-dot ${ciDotClass(repo.ci_status)}"></span>
                    ${repo.ci_status || 'unknown'}
                </span>
            </div>
            <div class="repo-card-upstream">fork of ${repo.upstream}</div>
            <div class="repo-card-stats">
                <div class="repo-card-stat">
                    <div class="repo-card-stat-value">${repo.closed_issues || 0}</div>
                    <div class="repo-card-stat-label">Resolved</div>
                </div>
                <div class="repo-card-stat">
                    <div class="repo-card-stat-value">${prs.merged || 0}</div>
                    <div class="repo-card-stat-label">Merged</div>
                </div>
                <div class="repo-card-stat">
                    <div class="repo-card-stat-value">${repo.open_issues || 0}</div>
                    <div class="repo-card-stat-label">Open</div>
                </div>
            </div>
            <div class="repo-card-cost">
                <span class="repo-card-cost-total">${formatCost(costs.total_usd)}</span>
                <span class="repo-card-cost-avg">avg/merge: <span>${formatCost(costs.avg_cost_per_merge)}</span></span>
            </div>
            <div class="repo-card-footer">
                <span>Last activity: ${timeAgo(repo.last_commit)}</span>
                <span>&rarr; Details</span>
            </div>
        </div>
    `;
}

function renderCostSummary(repos, totalCost) {
    const reposWithCosts = repos
        .filter(r => r.costs?.total_usd > 0)
        .sort((a, b) => b.costs.total_usd - a.costs.total_usd);

    if (reposWithCosts.length === 0) return '';

    const maxCost = reposWithCosts[0].costs.total_usd;

    const bars = reposWithCosts.map(r => {
        const pct = maxCost > 0 ? (r.costs.total_usd / maxCost) * 100 : 0;
        return `
            <div class="cost-bar-row">
                <span class="cost-bar-label">${shortName(r.name)}</span>
                <div class="cost-bar-track">
                    <div class="cost-bar-fill" style="width: ${pct}%"></div>
                </div>
                <span class="cost-bar-value">${formatCost(r.costs.total_usd)}</span>
            </div>
        `;
    }).join('');

    return `
        <div class="cost-summary">
            <div class="cost-summary-header">
                <div>
                    <div class="section-label">Cost Tracking</div>
                    <div class="section-title">Spend by repository</div>
                </div>
                <div class="cost-summary-total">${formatCost(totalCost)}</div>
            </div>
            ${bars}
        </div>
    `;
}

function attachHomeEvents() {
    document.querySelectorAll('.repo-card[data-repo]').forEach(card => {
        card.addEventListener('click', () => {
            location.hash = `#/repo/${card.dataset.repo}`;
        });
    });
}

// ========== FORK DETAIL PAGE ==========

function renderForkDetail(repo) {
    const costs = repo.costs || {};
    const costIssues = costs.issues || {};
    const prs = repo.prs || {};
    const slug = shortName(repo.name);

    const allIssues = (repo.issues || [])
        .filter(i => !i.labels?.includes('dependencies'))
        .map(iss => {
            const costData = costIssues[String(iss.number)] || {};
            return { ...iss, ...costData };
        })
        .sort((a, b) => b.number - a.number);

    // Also include cost-tracked issues not in the issues list
    Object.entries(costIssues).forEach(([num, data]) => {
        if (!allIssues.find(i => i.number === parseInt(num))) {
            allIssues.push({
                number: parseInt(num),
                title: data.title || `Issue #${num}`,
                state: data.state || 'unknown',
                ...data,
            });
        }
    });

    allIssues.sort((a, b) => b.number - a.number);

    const issueRows = allIssues.map(iss => renderIssueRow(repo, iss)).join('');
    const activityFeed = renderActivityFeed(repo.recent_commits || [], repo.name);

    return `
        <div class="page">
            <a href="#/" class="back-link">&larr; All Repos</a>

            <div class="fork-header">
                <div class="fork-title">
                    <a href="https://github.com/${repo.name}" target="_blank" rel="noopener">${slug}</a>
                </div>
                <span class="repo-card-ci">
                    <span class="ci-dot ${ciDotClass(repo.ci_status)}"></span>
                    CI ${repo.ci_status || 'unknown'}
                </span>
            </div>
            <div class="fork-upstream">
                fork of <a href="https://github.com/${repo.upstream}" target="_blank" rel="noopener">${repo.upstream}</a>
            </div>

            <div class="stats-row">
                <div class="stat-card">
                    <div class="stat-value">${repo.closed_issues || 0}</div>
                    <div class="stat-label">Resolved</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${repo.open_issues || 0}</div>
                    <div class="stat-label">Open</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${prs.merged || 0}</div>
                    <div class="stat-label">PRs Merged</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${prs.open || 0}</div>
                    <div class="stat-label">PRs Open</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${formatCost(costs.total_usd)}</div>
                    <div class="stat-label">Total Cost</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${formatCost(costs.avg_cost_per_merge)}</div>
                    <div class="stat-label">Avg / Merge</div>
                </div>
            </div>

            <div class="issues-section">
                <div class="section-label">Issues</div>
                <div class="section-title">Issue tracker</div>
                ${allIssues.length > 0 ? `
                <table class="issues-table">
                    <thead>
                        <tr>
                            <th style="width:30px"></th>
                            <th style="width:50px">#</th>
                            <th>Title</th>
                            <th style="width:100px">Status</th>
                            <th style="width:60px">PR</th>
                            <th style="width:70px">Cost</th>
                            <th style="width:60px">Phases</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${issueRows}
                    </tbody>
                </table>
                ` : '<div class="empty-state">No issues tracked yet.</div>'}
            </div>

            <div class="activity-section">
                <div class="section-label">Activity</div>
                <div class="section-title">Recent commits</div>
                ${activityFeed}
            </div>
        </div>
    `;
}

function renderIssueRow(repo, iss) {
    const hasEntries = iss.entries && iss.entries.length > 0;
    const expandClass = hasEntries ? 'expandable' : '';
    const arrowHtml = hasEntries
        ? `<span class="expand-arrow" data-issue="${iss.number}">&#9654;</span>`
        : '';
    const outcome = iss.outcome || (iss.state === 'closed' ? 'closed' : iss.state);
    const totalCost = iss.total_usd || 0;
    const phases = iss.entries ? iss.entries.length : 0;
    const prNum = iss.pr_number;
    const prLink = prNum
        ? `<a class="pr-link" href="https://github.com/${repo.name}/pull/${prNum}" target="_blank">#${prNum}</a>`
        : '<span class="pr-link">--</span>';

    const mainRow = `
        <tr class="${expandClass}" data-toggle="${iss.number}">
            <td>${arrowHtml}</td>
            <td><span class="issue-number">${iss.number}</span></td>
            <td><span class="issue-title-text"><a href="https://github.com/${repo.name}/issues/${iss.number}" target="_blank">${iss.title || `Issue #${iss.number}`}</a></span></td>
            <td>${issueStateBadge(iss.state, outcome)}</td>
            <td>${prLink}</td>
            <td><span class="cost-cell ${totalCost === 0 ? 'zero' : ''}">${formatCost(totalCost)}</span></td>
            <td><span class="phases-cell">${phases}</span></td>
        </tr>
    `;

    if (!hasEntries) return mainRow;

    const detailRow = renderIssueDetailRow(iss);
    return mainRow + detailRow;
}

function renderIssueDetailRow(iss) {
    const entries = iss.entries || [];
    const maxCost = Math.max(...entries.map(e => e.cost_usd || 0), 0.01);

    const bars = entries.map(e => {
        const pct = maxCost > 0 ? ((e.cost_usd || 0) / maxCost) * 100 : 0;
        const tokens = (e.tokens_in || 0) + (e.tokens_out || 0);
        return `
            <div class="phase-bar-row">
                <span class="phase-bar-label">${phaseName(e.phase)}</span>
                <div class="phase-bar-track">
                    <div class="phase-bar-fill ${phaseBarClass(e.phase)}" style="width: ${Math.max(pct, 2)}%"></div>
                </div>
                <span class="phase-bar-value">${formatCostPrecise(e.cost_usd)}</span>
                <span class="phase-bar-tokens">${formatTokens(tokens)} tok</span>
            </div>
        `;
    }).join('');

    return `
        <tr class="issue-detail-row" data-detail="${iss.number}" style="display: none;">
            <td colspan="7">
                <div class="issue-detail-content">
                    <div class="phase-bars">
                        ${bars}
                    </div>
                </div>
            </td>
        </tr>
    `;
}

function renderActivityFeed(commits, repoName) {
    if (!commits || commits.length === 0) {
        return '<div class="empty-state">No recent activity.</div>';
    }

    const items = commits.map(c => `
        <div class="activity-item">
            <span class="activity-author">${c.author}</span>
            <span class="activity-message">-- ${c.message}</span>
            <div class="activity-time">${timeAgo(c.date)}</div>
        </div>
    `).join('');

    return `<div class="activity-feed">${items}</div>`;
}

function attachForkDetailEvents(repo) {
    document.querySelectorAll('tr.expandable').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('a')) return;
            const issueNum = row.dataset.toggle;
            const detailRow = document.querySelector(`tr[data-detail="${issueNum}"]`);
            const arrow = row.querySelector('.expand-arrow');
            if (!detailRow) return;

            const isHidden = detailRow.style.display === 'none';
            detailRow.style.display = isHidden ? 'table-row' : 'none';
            if (arrow) arrow.classList.toggle('open', isHidden);
        });
    });
}

// ========== INIT ==========

loadData();
