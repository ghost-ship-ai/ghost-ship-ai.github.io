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
