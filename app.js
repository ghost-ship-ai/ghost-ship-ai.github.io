const ORG = 'ghost-ship-ai';

async function fetchOrgRepos() {
  try {
    const res = await fetch(`https://api.github.com/orgs/${ORG}/repos?type=forks&per_page=30&sort=updated`);
    if (!res.ok) throw new Error(res.statusText);
    const repos = await res.json();
    return repos.filter(r => r.fork && !r.name.includes('ghost-ship') && !r.name.includes('OpenHands') && !r.name.includes('pr-agent') && !r.name.includes('-private'));
  } catch {
    return [];
  }
}

async function fetchRepoDetails(repo) {
  const [issuesRes, commitsRes] = await Promise.allSettled([
    fetch(`https://api.github.com/repos/${repo.full_name}/issues?state=all&per_page=1`),
    fetch(`https://api.github.com/repos/${repo.full_name}/commits?per_page=1`),
  ]);
  const lastCommit = commitsRes.status === 'fulfilled' && commitsRes.value.ok
    ? (await commitsRes.value.json())[0] : null;
  return { lastCommit };
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 2592000)}mo ago`;
}

function renderRepoCard(repo, details) {
  const lastActivity = details.lastCommit
    ? timeAgo(details.lastCommit.commit.author.date) : 'unknown';
  const isBot = details.lastCommit
    && details.lastCommit.commit.author.name.includes('[bot]');

  return `
    <a href="${repo.html_url}" class="repo-card" target="_blank" rel="noopener">
      <div class="repo-header">
        <span class="repo-name">${repo.name}</span>
        <span class="repo-status">
          <span class="status-dot"></span>
          Maintained
        </span>
      </div>
      <div class="repo-description">${repo.description || 'Autonomously maintained fork.'}</div>
      <div class="repo-meta">
        <span class="repo-meta-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          ${repo.stargazers_count}
        </span>
        <span class="repo-meta-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${lastActivity}
        </span>
        <span class="repo-meta-item">
          ${repo.language || '—'}
        </span>
      </div>
    </a>
  `;
}

function renderEmptyState() {
  return `
    <div class="repo-loading">
      <p style="margin-bottom: 8px;">No maintained repos yet — or GitHub API rate limit reached.</p>
      <p>Visit <a href="https://github.com/${ORG}" style="color: var(--accent);" target="_blank">github.com/${ORG}</a> to see all repositories.</p>
    </div>
  `;
}

async function init() {
  const grid = document.getElementById('repos-grid');
  const repos = await fetchOrgRepos();

  if (repos.length === 0) {
    grid.innerHTML = renderEmptyState();
    return;
  }

  const statsRepos = document.getElementById('stat-repos');
  const statsIssues = document.getElementById('stat-issues');
  if (statsRepos) statsRepos.textContent = repos.length;

  let totalIssues = 0;
  const cards = [];

  for (const repo of repos) {
    const details = await fetchRepoDetails(repo);
    cards.push(renderRepoCard(repo, details));
    totalIssues += repo.open_issues_count;
  }

  grid.innerHTML = cards.join('');
  if (statsIssues) statsIssues.textContent = totalIssues;
}

document.addEventListener('DOMContentLoaded', init);


// ========== REPO REQUEST FORM ==========

let checkedRepo = null;

function parseRepoUrl(input) {
  const trimmed = input.trim().replace(/\/+$/, '');
  const ghMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (ghMatch) return { owner: ghMatch[1], name: ghMatch[2] };
  const shortMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shortMatch) return { owner: shortMatch[1], name: shortMatch[2] };
  return null;
}

async function checkRepo() {
  const input = document.getElementById('repo-url');
  const resultDiv = document.getElementById('repo-result');
  const errorDiv = document.getElementById('repo-error');
  const successDiv = document.getElementById('repo-success');
  const btn = document.getElementById('repo-check-btn');

  resultDiv.style.display = 'none';
  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';
  checkedRepo = null;

  const parsed = parseRepoUrl(input.value);
  if (!parsed) {
    errorDiv.textContent = 'Please enter a valid GitHub repo URL (e.g. https://github.com/owner/repo)';
    errorDiv.style.display = 'block';
    return;
  }

  btn.textContent = 'Checking...';
  btn.disabled = true;

  try {
    const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.name}`);
    if (!res.ok) {
      errorDiv.textContent = 'Repository not found. Check the URL and try again.';
      errorDiv.style.display = 'block';
      return;
    }

    const repo = await res.json();
    checkedRepo = repo;

    const now = Date.now();
    const lastPush = new Date(repo.pushed_at).getTime();
    const daysSinceUpdate = Math.floor((now - lastPush) / (1000 * 60 * 60 * 24));
    const isAbandoned = daysSinceUpdate > 180;
    const hasDemand = repo.stargazers_count >= 10 || repo.open_issues_count >= 3;
    const isSmall = true; // can't check LOC from API without cloning
    const goodLicense = !repo.license || ['mit', 'apache-2.0', 'bsd-2-clause', 'bsd-3-clause', 'isc', 'unlicense', 'mpl-2.0'].includes(repo.license.spdx_id?.toLowerCase());
    const notArchived = !repo.archived;
    const notFork = !repo.fork;

    const criteria = [
      { label: `Last updated ${daysSinceUpdate} days ago`, pass: isAbandoned, warn: daysSinceUpdate > 90 },
      { label: `${repo.stargazers_count} stars, ${repo.open_issues_count} open issues`, pass: hasDemand },
      { label: `License: ${repo.license?.spdx_id || 'None detected'}`, pass: goodLicense },
      { label: notArchived ? 'Not archived' : 'Archived', pass: notArchived },
      { label: notFork ? 'Original repo (not a fork)' : 'This is already a fork', pass: notFork },
    ];

    const passCount = criteria.filter(c => c.pass).length;
    const qualifies = passCount >= 4;
    const maybe = passCount >= 3;

    document.getElementById('result-name').textContent = repo.full_name;

    const badge = document.getElementById('result-badge');
    if (qualifies) {
      badge.textContent = 'Qualifies';
      badge.className = 'repo-result-badge badge-qualifies';
    } else if (maybe) {
      badge.textContent = 'Maybe';
      badge.className = 'repo-result-badge badge-maybe';
    } else {
      badge.textContent = 'Unlikely';
      badge.className = 'repo-result-badge badge-no';
    }

    document.getElementById('result-details').textContent = repo.description || 'No description.';

    document.getElementById('result-criteria').innerHTML = criteria.map(c => {
      const cls = c.pass ? 'criteria-pass' : (c.warn ? 'criteria-warn' : 'criteria-fail');
      const icon = c.pass ? '✓' : (c.warn ? '~' : '✗');
      return `<div class="criteria-item ${cls}"><span>${icon}</span> ${c.label}</div>`;
    }).join('');

    const submitBtn = document.getElementById('submit-btn');
    if (qualifies || maybe) {
      submitBtn.style.display = 'block';
      submitBtn.textContent = 'Submit Request';
      submitBtn.disabled = false;
    } else {
      submitBtn.style.display = 'none';
    }

    resultDiv.style.display = 'block';

  } catch (e) {
    errorDiv.textContent = 'Failed to check repo. GitHub API may be rate-limited — try again in a minute.';
    errorDiv.style.display = 'block';
  } finally {
    btn.textContent = 'Check';
    btn.disabled = false;
  }
}

function submitRequest() {
  if (!checkedRepo) return;

  const repo = checkedRepo;
  const title = encodeURIComponent(`[Request] Maintain ${repo.full_name}`);
  const body = encodeURIComponent(
    `## Repo Request\n\n` +
    `**Repository:** ${repo.html_url}\n` +
    `**Stars:** ${repo.stargazers_count}\n` +
    `**Open Issues:** ${repo.open_issues_count}\n` +
    `**Last Updated:** ${repo.pushed_at}\n` +
    `**Language:** ${repo.language || 'Unknown'}\n` +
    `**License:** ${repo.license?.spdx_id || 'None'}\n` +
    `**Description:** ${repo.description || 'None'}\n\n` +
    `---\n*Submitted via ghost-ship-ai.github.io*`
  );

  const url = `https://github.com/ghost-ship-ai/ghost-ship-ai.github.io/issues/new?title=${title}&body=${body}&labels=repo-request`;
  window.open(url, '_blank');

  const successDiv = document.getElementById('repo-success');
  successDiv.innerHTML = 'Request opened! We\'ll evaluate this repo and respond on the issue.';
  successDiv.style.display = 'block';

  document.getElementById('submit-btn').textContent = 'Submitted';
  document.getElementById('submit-btn').disabled = true;
}
