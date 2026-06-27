import { apiRequest, requireAdmin, signOut } from "./api.js";
import { missions } from "./missions.js";
import { spriteIcon } from "./icons.js";

const missionById = new Map(missions.map((mission) => [mission.id, mission]));
const viewCopy = {
  dashboard: ["CONTROL ROOM / OVERVIEW", "Live system status", "Track player accounts and mission results from one place."],
  users: ["CONTROL ROOM / PLAYERS", "Manage player accounts", "Create, edit, suspend, and review player activity."],
  submissions: ["CONTROL ROOM / SUBMISSIONS", "Validated runs", "Review time, code, and verified routes from the server."],
};
const filterGroups = {
  dashboard: [{ value: "all", label: "Everything", group: "Overview" }],
  users: [
    { value: "all", label: "All statuses", group: "Account status" },
    { value: "active", label: "Active", group: "Account status" },
    { value: "suspended", label: "Suspended", group: "Account status" },
  ],
  submissions: [
    { value: "all", label: "All missions", group: "Mission" },
    ...missions.map((mission) => ({
      value: mission.id,
      label: `Mission ${mission.number} — ${mission.name}`,
      group: "Mission",
    })),
  ],
};

const dom = {
  navButtons: [...document.querySelectorAll("[data-view]")],
  viewKicker: document.querySelector("#view-kicker"),
  viewTitle: document.querySelector("#view-title"),
  viewDescription: document.querySelector("#view-description"),
  views: {
    dashboard: document.querySelector("#dashboard-view"),
    users: document.querySelector("#users-view"),
    submissions: document.querySelector("#submissions-view"),
  },
  adminName: document.querySelector("#admin-name"),
  adminLogout: document.querySelector("#admin-logout"),
  globalSearch: document.querySelector("#global-search"),
  filterControl: document.querySelector("#filter-control"),
  filterButton: document.querySelector("#filter-button"),
  filterLabel: document.querySelector("#filter-label"),
  filterPopover: document.querySelector("#filter-popover"),
  filterSearch: document.querySelector("#filter-search"),
  filterOptions: document.querySelector("#filter-options"),
  filterEmpty: document.querySelector("#filter-empty"),
  createUserButton: document.querySelector("#create-user-button"),
  metricUsers: document.querySelector("#metric-users"),
  metricActiveCopy: document.querySelector("#metric-active-copy"),
  metricSubmissions: document.querySelector("#metric-submissions"),
  metricDuration: document.querySelector("#metric-duration"),
  metricCompletion: document.querySelector("#metric-completion"),
  metricSuspended: document.querySelector("#metric-suspended"),
  missionPulse: document.querySelector("#mission-pulse"),
  recentSubmissions: document.querySelector("#recent-submissions"),
  usersTableBody: document.querySelector("#users-table-body"),
  usersCount: document.querySelector("#users-count"),
  usersEmpty: document.querySelector("#users-empty"),
  submissionsTableBody: document.querySelector("#submissions-table-body"),
  submissionsCount: document.querySelector("#submissions-count"),
  submissionsEmpty: document.querySelector("#submissions-empty"),
  submissionDrawer: document.querySelector("#submission-drawer"),
  drawerContent: document.querySelector("#drawer-content"),
  userModal: document.querySelector("#user-modal"),
  userModalTitle: document.querySelector("#user-modal-title"),
  userForm: document.querySelector("#user-form"),
  userId: document.querySelector("#user-id"),
  passwordLabel: document.querySelector("#password-label"),
  statusField: document.querySelector("#status-field"),
  userFormError: document.querySelector("#user-form-error"),
  saveUserButton: document.querySelector("#save-user-button"),
  deleteModal: document.querySelector("#delete-modal"),
  deleteCopy: document.querySelector("#delete-copy"),
  confirmDeleteButton: document.querySelector("#confirm-delete-button"),
  toast: document.querySelector("#admin-toast"),
  toastCopy: document.querySelector("#admin-toast-copy"),
};

let currentView = "dashboard";
let selectedFilter = "all";
let overview = null;
let users = [];
let submissions = [];
let editingUser = null;
let deletingUser = null;
let searchTimer = 0;
let toastTimer = 0;

const admin = await requireAdmin();
dom.adminName.textContent = admin.username;
bindEvents();
renderFilterOptions();
await refreshAll();

function bindEvents() {
  dom.navButtons.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  document.querySelectorAll("[data-open-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.openView));
  });
  dom.adminLogout.addEventListener("click", async () => {
    await signOut();
    window.location.replace("/");
  });
  dom.globalSearch.addEventListener("input", scheduleRefresh);
  dom.filterButton.addEventListener("click", toggleFilter);
  dom.filterSearch.addEventListener("input", renderFilterOptions);
  dom.createUserButton.addEventListener("click", () => openUserModal());
  dom.userForm.addEventListener("submit", saveUser);
  dom.statusField.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => setModalStatus(button.dataset.status));
  });
  dom.confirmDeleteButton.addEventListener("click", deleteUser);

  document.addEventListener("pointerdown", (event) => {
    if (!dom.filterControl.contains(event.target)) closeFilter();
    const menuButton = event.target.closest("[data-user-menu]");
    if (menuButton) {
      event.stopPropagation();
      toggleUserMenu(menuButton);
      return;
    }
    if (!event.target.closest(".row-action-menu")) closeUserMenus();
  });
  document.addEventListener("click", handleDelegatedClick);
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      dom.globalSearch.focus();
    }
    if (event.key === "Escape") {
      closeFilter();
      closeDrawer();
      closeUserModal();
      closeDeleteModal();
    }
  });
}

async function refreshAll() {
  setLoading(true);
  try {
    const [overviewResponse, userResponse, submissionResponse] = await Promise.all([
      apiRequest("/api/admin/overview"),
      loadUsers(),
      loadSubmissions(),
    ]);
    overview = overviewResponse;
    users = userResponse.items;
    submissions = submissionResponse.items;
    renderAll();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setLoading(false);
  }
}

async function loadUsers() {
  const params = new URLSearchParams();
  const search = dom.globalSearch.value.trim();
  if (search) params.set("search", search);
  if (currentView === "users" && selectedFilter !== "all") {
    params.set("status", selectedFilter);
  }
  return apiRequest(`/api/admin/users?${params}`);
}

async function loadSubmissions() {
  const params = new URLSearchParams();
  const search = dom.globalSearch.value.trim();
  if (search) params.set("search", search);
  if (currentView === "submissions" && selectedFilter !== "all") {
    params.set("mission_id", selectedFilter);
  }
  return apiRequest(`/api/admin/submissions?${params}`);
}

function scheduleRefresh() {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(async () => {
    try {
      if (currentView === "users") users = (await loadUsers()).items;
      if (currentView === "submissions") submissions = (await loadSubmissions()).items;
      if (currentView === "dashboard") {
        [users, submissions] = await Promise.all([
          loadUsers().then((response) => response.items),
          loadSubmissions().then((response) => response.items),
        ]);
      }
      renderAll();
    } catch (error) {
      showToast(error.message, true);
    }
  }, 260);
}

async function switchView(view) {
  if (!viewCopy[view]) return;
  currentView = view;
  selectedFilter = "all";
  dom.filterSearch.value = "";
  dom.navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  Object.entries(dom.views).forEach(([name, element]) => {
    element.hidden = name !== view;
  });
  [dom.viewKicker.textContent, dom.viewTitle.textContent, dom.viewDescription.textContent] = viewCopy[view];
  dom.createUserButton.hidden = view === "submissions";
  dom.globalSearch.placeholder = view === "submissions"
    ? "Search players, email, or code"
    : "Search username or email";
  renderFilterOptions();
  closeFilter();
  scheduleRefresh();
}

function renderAll() {
  if (overview) renderOverview();
  renderUsers();
  renderSubmissions();
  renderRecent();
  renderMissionPulse();
}

function renderOverview() {
  dom.metricUsers.textContent = formatNumber(overview.total_users);
  dom.metricActiveCopy.textContent = `${formatNumber(overview.active_users)} active accounts`;
  dom.metricSubmissions.textContent = formatNumber(overview.total_submissions);
  dom.metricDuration.textContent = formatDuration(overview.average_duration_ms);
  dom.metricCompletion.textContent = `${Math.round(overview.completion_rate)}%`;
  dom.metricSuspended.textContent = `${formatNumber(overview.suspended_users)} suspended accounts`;
}

function renderUsers() {
  dom.usersCount.textContent = `${formatNumber(users.length)} items`;
  dom.usersEmpty.hidden = users.length > 0;
  dom.usersTableBody.innerHTML = users.map((user) => `
    <tr>
      <td>
        <div class="user-cell">
          <span class="table-avatar">${escapeHtml(user.username.slice(0, 1).toUpperCase())}</span>
          <span><strong>${escapeHtml(user.username)}</strong><small>${escapeHtml(user.email)}</small></span>
        </div>
      </td>
      <td><span class="status-chip ${user.status}"><i></i>${user.status === "active" ? "Active" : "Suspended"}</span></td>
      <td class="center-cell">${formatNumber(user.submission_count)}</td>
      <td class="center-cell"><span class="star-total">${formatNumber(user.best_star_total)} / 12</span></td>
      <td class="date-cell">${formatDate(user.last_login_at || user.created_at)}</td>
      <td class="action-cell">
        <button class="row-menu-button" type="button" data-user-menu="${user.id}" aria-label="Actions for ${escapeHtml(user.username)}">
          ${spriteIcon("ellipsis")}
        </button>
        <div class="row-action-menu" data-user-actions="${user.id}" hidden>
          <button type="button" data-edit-user="${user.id}">Edit account</button>
          <button type="button" data-toggle-user="${user.id}">${user.status === "active" ? "Suspend account" : "Reactivate account"}</button>
          <button class="danger" type="button" data-delete-user="${user.id}">Delete account</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderSubmissions() {
  dom.submissionsCount.textContent = `${formatNumber(submissions.length)} items`;
  dom.submissionsEmpty.hidden = submissions.length > 0;
  dom.submissionsTableBody.innerHTML = submissions.map((submission) => {
    const mission = missionById.get(submission.mission_id);
    return `
      <tr class="clickable-row" data-open-submission="${submission.id}">
        <td><div class="user-cell"><span class="table-avatar">${escapeHtml(submission.username.slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(submission.username)}</strong><small>${escapeHtml(submission.email)}</small></span></div></td>
        <td><span class="mission-cell"><small>MISSION ${mission?.number || "--"}</small><strong>${escapeHtml(mission?.name || submission.mission_id)}</strong></span></td>
        <td><span class="result-cell"><strong>${submission.steps} steps</strong><small>${renderStars(submission.stars)}</small></span></td>
        <td class="center-cell">${formatDuration(submission.duration_ms)}</td>
        <td class="date-cell">${formatDate(submission.created_at)}</td>
        <td class="action-cell"><button class="row-open-button" type="button" aria-label="View details">${spriteIcon("chevron-right")}</button></td>
      </tr>
    `;
  }).join("");
}

function renderRecent() {
  const recent = submissions.slice(0, 5);
  dom.recentSubmissions.innerHTML = recent.length
    ? recent.map((submission) => {
      const mission = missionById.get(submission.mission_id);
      return `
        <button type="button" data-open-submission="${submission.id}">
          <span class="activity-route"><i></i><i></i><i></i></span>
          <span><strong>${escapeHtml(submission.username)}</strong><small>Mission ${mission?.number || "--"} • ${submission.steps} steps</small></span>
          <time>${formatRelativeDate(submission.created_at)}</time>
        </button>
      `;
    }).join("")
    : `<div class="panel-empty">No submissions yet</div>`;
}

function renderMissionPulse() {
  const total = Math.max(1, submissions.length);
  dom.missionPulse.innerHTML = missions.map((mission) => {
    const missionRuns = submissions.filter((submission) => submission.mission_id === mission.id);
    const share = Math.round((missionRuns.length / total) * 100);
    const averageStars = missionRuns.length
      ? missionRuns.reduce((sum, run) => sum + run.stars, 0) / missionRuns.length
      : 0;
    return `
      <article>
        <div class="pulse-ring" style="--pulse: ${share * 3.6}deg"><span>${share}%</span></div>
        <span><small>MISSION ${mission.number}</small><strong>${escapeHtml(mission.name)}</strong><em>${averageStars.toFixed(1)} avg stars</em></span>
      </article>
    `;
  }).join("");
}

function toggleFilter() {
  const open = dom.filterPopover.hidden;
  dom.filterPopover.hidden = !open;
  dom.filterButton.setAttribute("aria-expanded", String(open));
  if (open) {
    dom.filterSearch.value = "";
    renderFilterOptions();
    window.setTimeout(() => dom.filterSearch.focus(), 0);
  }
}

function closeFilter() {
  dom.filterPopover.hidden = true;
  dom.filterButton.setAttribute("aria-expanded", "false");
}

function renderFilterOptions() {
  const query = dom.filterSearch.value.trim().toLocaleLowerCase("en-US");
  const options = filterGroups[currentView].filter((option) =>
    option.label.toLocaleLowerCase("en-US").includes(query),
  );
  dom.filterEmpty.hidden = options.length > 0;
  dom.filterOptions.innerHTML = options.map((option, index) => {
    const previous = options[index - 1];
    const heading = !previous || previous.group !== option.group
      ? `<span class="filter-group-label">${escapeHtml(option.group)}</span>`
      : "";
    return `${heading}<button class="${selectedFilter === option.value ? "selected" : ""}" type="button" data-filter="${option.value}">
      <span>${escapeHtml(option.label)}</span>
      ${spriteIcon("check")}
    </button>`;
  }).join("");
  dom.filterLabel.textContent = filterGroups[currentView].find((option) => option.value === selectedFilter)?.label || "All filters";
}

function handleDelegatedClick(event) {
  const filter = event.target.closest("[data-filter]");
  if (filter) {
    selectedFilter = filter.dataset.filter;
    renderFilterOptions();
    closeFilter();
    scheduleRefresh();
    return;
  }
  const submissionTarget = event.target.closest("[data-open-submission]");
  if (submissionTarget) {
    openSubmission(Number(submissionTarget.dataset.openSubmission));
    return;
  }
  const editTarget = event.target.closest("[data-edit-user]");
  if (editTarget) {
    openUserModal(users.find((user) => user.id === Number(editTarget.dataset.editUser)));
    return;
  }
  const toggleTarget = event.target.closest("[data-toggle-user]");
  if (toggleTarget) {
    toggleUserStatus(Number(toggleTarget.dataset.toggleUser));
    return;
  }
  const deleteTarget = event.target.closest("[data-delete-user]");
  if (deleteTarget) {
    openDeleteModal(Number(deleteTarget.dataset.deleteUser));
    return;
  }
  if (event.target.closest("[data-close-drawer]")) closeDrawer();
  if (event.target.closest("[data-close-modal]")) closeUserModal();
  if (event.target.closest("[data-close-delete]")) closeDeleteModal();
}

function openSubmission(id) {
  const submission = submissions.find((item) => item.id === id);
  if (!submission) return;
  const mission = missionById.get(submission.mission_id);
  dom.drawerContent.innerHTML = `
    <div class="drawer-run-header">
      <div class="drawer-user"><span class="table-avatar">${escapeHtml(submission.username.slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(submission.username)}</strong><small>${escapeHtml(submission.email)}</small></span></div>
      <span class="drawer-date">${formatFullDate(submission.created_at)}</span>
    </div>
    <div class="drawer-metrics">
      <div><span>Mission</span><strong>${mission?.number || "--"}</strong><small>${escapeHtml(mission?.name || submission.mission_id)}</small></div>
      <div><span>Steps</span><strong>${submission.steps}</strong><small>PAR ${mission?.par || "--"}</small></div>
      <div><span>Time</span><strong>${formatDuration(submission.duration_ms)}</strong><small>${renderStars(submission.stars)}</small></div>
    </div>
    <section class="route-section">
      <header><span>2D ROUTE</span><strong>Validated route</strong></header>
      ${renderRoute(mission, submission.route)}
      <div class="route-legend"><span><i class="start"></i>Start</span><span><i class="goal"></i>Goal</span><span><i class="wall"></i>Obstacle</span></div>
    </section>
    <section class="code-section">
      <header><span>SOURCE CODE</span><strong>route.bot</strong><button type="button" data-copy-code="${submission.id}">Copy</button></header>
      <pre><code>${escapeHtml(submission.code)}</code></pre>
    </section>
  `;
  dom.drawerContent.querySelector("[data-copy-code]").addEventListener("click", async (event) => {
    await navigator.clipboard.writeText(submission.code);
    event.currentTarget.textContent = "Copied";
  });
  dom.submissionDrawer.hidden = false;
  document.body.classList.add("drawer-open");
}

function renderRoute(mission, route) {
  if (!mission) return `<div class="route-unavailable">Board data unavailable</div>`;
  const obstacleKeys = new Set(mission.obstacles.map(([column, row]) => `${column},${row}`));
  const cells = [];
  for (let row = 0; row < mission.size; row += 1) {
    for (let column = 0; column < mission.size; column += 1) {
      const key = `${column},${row}`;
      const classes = ["route-cell"];
      if (obstacleKeys.has(key)) classes.push("wall");
      if (column === mission.start[0] && row === mission.start[1]) classes.push("start");
      if (column === mission.goal[0] && row === mission.goal[1]) classes.push("goal");
      cells.push(`<i class="${classes.join(" ")}"></i>`);
    }
  }
  const points = route.map(([column, row]) => `${column + 0.5},${row + 0.5}`).join(" ");
  return `
    <div class="route-map" style="--grid-size:${mission.size}">
      <div class="route-grid">${cells.join("")}</div>
      <svg viewBox="0 0 ${mission.size} ${mission.size}" preserveAspectRatio="none" aria-label="Player route">
        <polyline points="${points}" />
        ${route.map(([column, row], index) => `<circle cx="${column + 0.5}" cy="${row + 0.5}" r="${index === 0 || index === route.length - 1 ? 0.18 : 0.1}" />`).join("")}
      </svg>
    </div>
  `;
}

function closeDrawer() {
  dom.submissionDrawer.hidden = true;
  document.body.classList.remove("drawer-open");
}

function openUserModal(user = null) {
  editingUser = user || null;
  dom.userForm.reset();
  dom.userFormError.hidden = true;
  dom.userId.value = user?.id || "";
  dom.userForm.elements.username.value = user?.username || "";
  dom.userForm.elements.email.value = user?.email || "";
  dom.userModalTitle.textContent = user ? "Edit player account" : "Create player account";
  dom.passwordLabel.textContent = user ? "New password (optional)" : "Password";
  dom.userForm.elements.password.required = !user;
  dom.statusField.hidden = !user;
  setModalStatus(user?.status || "active");
  dom.userModal.hidden = false;
  window.setTimeout(() => dom.userForm.elements.username.focus(), 0);
  closeUserMenus();
}

function closeUserModal() {
  dom.userModal.hidden = true;
  editingUser = null;
}

function setModalStatus(status) {
  dom.statusField.dataset.value = status;
  dom.statusField.querySelectorAll("[data-status]").forEach((button) => {
    button.classList.toggle("active", button.dataset.status === status);
  });
}

async function saveUser(event) {
  event.preventDefault();
  const form = new FormData(dom.userForm);
  const payload = {
    username: form.get("username"),
    email: form.get("email"),
    password: form.get("password"),
  };
  if (editingUser) payload.status = dom.statusField.dataset.value;
  if (editingUser && !payload.password) delete payload.password;

  dom.saveUserButton.disabled = true;
  dom.userFormError.hidden = true;
  try {
    await apiRequest(editingUser ? `/api/admin/users/${editingUser.id}` : "/api/admin/users", {
      method: editingUser ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    });
    closeUserModal();
    showToast(editingUser ? "Account updated" : "Account created");
    await refreshAll();
  } catch (error) {
    dom.userFormError.textContent = error.message;
    dom.userFormError.hidden = false;
  } finally {
    dom.saveUserButton.disabled = false;
  }
}

async function toggleUserStatus(id) {
  const user = users.find((item) => item.id === id);
  if (!user) return;
  closeUserMenus();
  try {
    await apiRequest(`/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: user.status === "active" ? "suspended" : "active" }),
    });
    showToast(user.status === "active" ? "Account suspended" : "Account reactivated");
    await refreshAll();
  } catch (error) {
    showToast(error.message, true);
  }
}

function openDeleteModal(id) {
  deletingUser = users.find((item) => item.id === id);
  if (!deletingUser) return;
  dom.deleteCopy.textContent = `Account ${deletingUser.username}, including all scores, code, and routes, will be permanently deleted.`;
  dom.deleteModal.hidden = false;
  closeUserMenus();
}

function closeDeleteModal() {
  dom.deleteModal.hidden = true;
  deletingUser = null;
}

async function deleteUser() {
  if (!deletingUser) return;
  dom.confirmDeleteButton.disabled = true;
  try {
    await apiRequest(`/api/admin/users/${deletingUser.id}`, { method: "DELETE" });
    closeDeleteModal();
    showToast("Account deleted");
    await refreshAll();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    dom.confirmDeleteButton.disabled = false;
  }
}

function toggleUserMenu(button) {
  const menu = document.querySelector(`[data-user-actions="${button.dataset.userMenu}"]`);
  const shouldOpen = menu.hidden;
  closeUserMenus();
  menu.hidden = !shouldOpen;
}

function closeUserMenus() {
  document.querySelectorAll("[data-user-actions]").forEach((menu) => {
    menu.hidden = true;
  });
}

function setLoading(loading) {
  document.body.classList.toggle("admin-loading", loading);
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  dom.toastCopy.textContent = message;
  dom.toast.classList.toggle("error", isError);
  dom.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    dom.toast.hidden = true;
  }, 3200);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.round((milliseconds || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(parseSqliteDate(value));
}

function formatFullDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parseSqliteDate(value));
}

function formatRelativeDate(value) {
  const differenceMinutes = Math.round((parseSqliteDate(value).getTime() - Date.now()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(differenceMinutes) < 60) return formatter.format(differenceMinutes, "minute");
  const hours = Math.round(differenceMinutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function parseSqliteDate(value) {
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

function renderStars(amount) {
  return [1, 2, 3]
    .map((star) => `<i class="${star <= amount ? "" : "empty"}">${spriteIcon("star", { className: star <= amount ? "icon-fill" : "" })}</i>`)
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
