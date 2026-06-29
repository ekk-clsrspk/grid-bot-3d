import { apiRequest, requireAdmin, signOut } from "./api.js";
import { missions, initMissions } from "./missions.js";
import { spriteIcon } from "./icons.js";

let missionById = new Map();
const viewCopy = {
  dashboard: ["CONTROL ROOM / OVERVIEW", "Live system status", "Track player accounts and mission results from one place."],
  users: ["CONTROL ROOM / PLAYERS", "Manage player accounts", "Create, edit, suspend, and review player activity."],
  submissions: ["CONTROL ROOM / SUBMISSIONS", "Validated runs", "Review time, code, and verified routes from the server."],
  stages: ["CONTROL ROOM / STAGES", "Game levels and maps", "Create, edit, delete, and visual design of levels."],
};
let filterGroups = {
  dashboard: [{ value: "all", label: "Everything", group: "Overview" }],
  users: [
    { value: "all", label: "All statuses", group: "Account status" },
    { value: "active", label: "Active", group: "Account status" },
    { value: "suspended", label: "Suspended", group: "Account status" },
  ],
  submissions: [],
  stages: [{ value: "all", label: "All stages", group: "Stage" }],
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
    stages: document.querySelector("#stages-view"),
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

  // Stage builder bindings
  stagesTableBody: document.querySelector("#stages-table-body"),
  stagesCount: document.querySelector("#stages-count"),
  stagesEmpty: document.querySelector("#stages-empty"),
  stageModal: document.querySelector("#stage-modal"),
  stageModalTitle: document.querySelector("#stage-modal-title"),
  stageForm: document.querySelector("#stage-form"),
  stageFormIsEdit: document.querySelector("#stage-form-is-edit"),
  stageIdField: document.querySelector("#stage-id"),
  stageNumberField: document.querySelector("#stage-number"),
  stageNameField: document.querySelector("#stage-name"),
  stageSubtitleField: document.querySelector("#stage-subtitle"),
  stageDescriptionField: document.querySelector("#stage-description"),
  stageSizeField: document.querySelector("#stage-size"),
  stageParField: document.querySelector("#stage-par"),
  stageDifficultyField: document.querySelector("#stage-difficulty"),
  stageStartLabel: document.querySelector("#stage-start-label"),
  stageGoalLabel: document.querySelector("#stage-goal-label"),
  stagePassableBadge: document.querySelector("#stage-passable-badge"),
  stageFormError: document.querySelector("#stage-form-error"),
  saveStageButton: document.querySelector("#save-stage-button"),
  gridBuilderCanvas: document.querySelector("#grid-builder-canvas"),
  gridClearBtn: document.querySelector("#grid-clear-btn"),
  brushButtons: document.querySelectorAll("[data-brush]"),
};

let currentView = "dashboard";
let selectedFilter = "all";
let overview = null;
let users = [];
let submissions = [];
let stages = [];

// Stage builder state
let builderObstacles = new Set();
let builderStart = [0, 0];
let builderGoal = [4, 4];
let builderBrush = "obstacle";
let isDrawing = false;
let drawMode = true;
let editingStage = null;
let deletingStage = null;

let editingUser = null;
let deletingUser = null;
let searchTimer = 0;
let toastTimer = 0;
let isFirstLoad = true;

const admin = await requireAdmin();
dom.adminName.textContent = admin.username;

// Set username in mobile profile elements
const mobileUsername = document.querySelector("#mobile-profile-username");
const mobileMenuName = document.querySelector("#mobile-profile-menu-name");
if (mobileUsername) mobileUsername.textContent = admin.username;
if (mobileMenuName) mobileMenuName.textContent = admin.username;

// Setup mobile profile dropdown toggling and logout
const mobileProfileTrigger = document.querySelector("#mobile-profile-trigger");
const mobileProfileDropdown = document.querySelector("#mobile-profile-dropdown");
const mobileProfileLogout = document.querySelector("#mobile-profile-logout");

if (mobileProfileTrigger && mobileProfileDropdown) {
  mobileProfileTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const show = mobileProfileDropdown.hidden;
    mobileProfileDropdown.hidden = !show;
    mobileProfileTrigger.setAttribute("aria-expanded", String(show));
  });

  document.addEventListener("pointerdown", (e) => {
    if (!mobileProfileTrigger.contains(e.target) && !mobileProfileDropdown.contains(e.target)) {
      mobileProfileDropdown.hidden = true;
      mobileProfileTrigger.setAttribute("aria-expanded", "false");
    }
  });
}

if (mobileProfileLogout) {
  mobileProfileLogout.addEventListener("click", async () => {
    await signOut();
    window.location.replace("/");
  });
}

// Load missions dynamically and initialize maps
await initMissions();
updateMissionsMap();
initializeFilterGroups();

bindEvents();
renderFilterOptions();
await refreshAll();

// Start automatic silent background refresh every 3 seconds
window.setInterval(() => {
  refreshAll(false);
}, 3000);

function updateMissionsMap() {
  missionById = new Map(missions.map((m) => [m.id, m]));
}

function initializeFilterGroups() {
  filterGroups.submissions = [
    { value: "all", label: "All missions", group: "Mission" },
    ...missions.map((mission) => ({
      value: mission.id,
      label: `Mission ${mission.number} — ${mission.name}`,
      group: "Mission",
    })),
  ];
}


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
  dom.confirmDeleteButton.addEventListener("click", handleDeleteConfirm);

  // Stage builder events
  dom.stageSizeField.addEventListener("input", handleGridSizeChange);
  dom.brushButtons.forEach((btn) => {
    btn.addEventListener("click", () => setBrush(btn.dataset.brush));
  });
  dom.gridClearBtn.addEventListener("click", () => {
    builderObstacles.clear();
    renderGridBuilder();
  });
  dom.stageForm.addEventListener("submit", handleStageFormSubmit);

  const createStageBtn = document.querySelector("#create-stage-button");
  if (createStageBtn) {
    createStageBtn.addEventListener("click", () => openStageModal());
  }

  document.addEventListener("mouseup", () => {
    isDrawing = false;
  });

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
      dom.stageModal.hidden = true;
    }
  });
}

async function refreshAll(showLoading = true) {
  if (showLoading) setLoading(true);
  try {
    const [overviewResponse, userResponse, submissionResponse, stagesResponse] = await Promise.all([
      apiRequest("/api/admin/overview"),
      loadUsers(),
      loadSubmissions(),
      loadStages(),
    ]);

    const overviewChanged = JSON.stringify(overview) !== JSON.stringify(overviewResponse);
    const usersChanged = JSON.stringify(users) !== JSON.stringify(userResponse.items);
    const submissionsChanged = JSON.stringify(submissions) !== JSON.stringify(submissionResponse.items);
    const stagesChanged = JSON.stringify(stages) !== JSON.stringify(stagesResponse);

    const dataChanged = overviewChanged || usersChanged || submissionsChanged || stagesChanged;

    if (dataChanged || isFirstLoad) {
      overview = overviewResponse;
      users = userResponse.items;
      submissions = submissionResponse.items;
      stages = stagesResponse;
      updateMissionsMap();
      initializeFilterGroups();
      renderAll();

      if (!isFirstLoad) {
        const bar = document.querySelector("#sync-bar");
        if (bar) {
          bar.classList.remove("syncing");
          void bar.offsetWidth; // Trigger reflow
          bar.classList.add("syncing");
          setTimeout(() => {
            bar.classList.remove("syncing");
          }, 2000);
        }
      }
      isFirstLoad = false;
    }
  } catch (error) {
    showToast(error.message, true);
  } finally {
    if (showLoading) setLoading(false);
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
      if (currentView === "stages") {
        stages = await loadStages();
        updateMissionsMap();
      }
      if (currentView === "dashboard") {
        [users, submissions, stages] = await Promise.all([
          loadUsers().then((response) => response.items),
          loadSubmissions().then((response) => response.items),
          loadStages(),
        ]);
        updateMissionsMap();
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
    if (element) element.hidden = name !== view;
  });
  [dom.viewKicker.textContent, dom.viewTitle.textContent, dom.viewDescription.textContent] = viewCopy[view];
  dom.createUserButton.hidden = view !== "users";
  dom.globalSearch.placeholder = view === "submissions"
    ? "Search players, email, or code"
    : view === "stages"
      ? "Search stage name, id or number"
      : "Search username or email";
  renderFilterOptions();
  closeFilter();
  scheduleRefresh();
}

function renderAll() {
  if (overview) renderOverview();
  if (currentView === "users") renderUsers();
  if (currentView === "submissions") renderSubmissions();
  if (currentView === "stages") renderStages();
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
  if (event.target.closest("[data-close-stage-modal]")) {
    dom.stageModal.hidden = true;
  }
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
  deletingStage = null;
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
  if (!value) return new Date();
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

// STAGES AND STAGE BUILDER FUNCTIONS
async function loadStages() {
  await initMissions();
  const search = dom.globalSearch.value.trim().toLowerCase();
  if (search) {
    return missions.filter((m) =>
      m.name.toLowerCase().includes(search) ||
      m.id.toLowerCase().includes(search) ||
      m.number.includes(search)
    );
  }
  return missions;
}

function renderStages() {
  dom.stagesTableBody.innerHTML = "";
  dom.stagesCount.textContent = `${stages.length} items`;
  dom.stagesEmpty.hidden = stages.length > 0;

  stages.forEach((stage) => {
    const tr = document.createElement("tr");

    const tdNumber = document.createElement("td");
    tdNumber.textContent = stage.number;
    tr.appendChild(tdNumber);

    const tdId = document.createElement("td");
    tdId.innerHTML = `<code>${escapeHtml(stage.id)}</code>`;
    tr.appendChild(tdId);

    const tdName = document.createElement("td");
    tdName.innerHTML = `<strong>${escapeHtml(stage.name)}</strong><br><small style="color: var(--muted);">${escapeHtml(stage.subtitle || "")}</small>`;
    tr.appendChild(tdName);

    const tdSize = document.createElement("td");
    tdSize.textContent = `${stage.size} × ${stage.size}`;
    tr.appendChild(tdSize);

    const tdStart = document.createElement("td");
    tdStart.textContent = `[${stage.start[0]}, ${stage.start[1]}]`;
    tr.appendChild(tdStart);

    const tdGoal = document.createElement("td");
    tdGoal.textContent = `[${stage.goal[0]}, ${stage.goal[1]}]`;
    tr.appendChild(tdGoal);

    const tdPar = document.createElement("td");
    tdPar.textContent = stage.par;
    tr.appendChild(tdPar);

    const tdDiff = document.createElement("td");
    tdDiff.innerHTML = renderStars(stage.difficulty);
    tr.appendChild(tdDiff);

    const tdObs = document.createElement("td");
    tdObs.textContent = stage.obstacles.length;
    tr.appendChild(tdObs);

    const tdActions = document.createElement("td");
    tdActions.className = "row-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.title = "Edit stage";
    editBtn.innerHTML = spriteIcon("pencil");
    editBtn.addEventListener("click", () => openStageModal(stage));
    tdActions.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.title = "Delete stage";
    deleteBtn.className = "danger-action";
    deleteBtn.innerHTML = spriteIcon("trash-2");
    deleteBtn.addEventListener("click", () => openDeleteStageModal(stage));
    tdActions.appendChild(deleteBtn);

    tr.appendChild(tdActions);
    dom.stagesTableBody.appendChild(tr);
  });
}

function openDeleteStageModal(stage) {
  deletingStage = stage;
  dom.deleteCopy.textContent = `Stage ${stage.number} (${stage.name}), including all associated submissions, will be permanently deleted.`;
  dom.deleteModal.hidden = false;
}

async function handleDeleteConfirm() {
  if (deletingUser) {
    await deleteUser();
  } else if (deletingStage) {
    await deleteStage();
  }
}

async function deleteStage() {
  if (!deletingStage) return;
  dom.confirmDeleteButton.disabled = true;
  try {
    await apiRequest(`/api/admin/missions/${deletingStage.id}`, { method: "DELETE" });
    closeDeleteModal();
    showToast("Stage deleted");
    await refreshAll();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    dom.confirmDeleteButton.disabled = false;
  }
}

function openStageModal(stage = null) {
  dom.stageFormError.textContent = "";
  dom.stageFormError.hidden = true;

  if (stage) {
    editingStage = stage;
    dom.stageFormIsEdit.value = "true";
    dom.stageIdField.value = stage.id;
    dom.stageIdField.readOnly = true;
    dom.stageNumberField.value = stage.number;
    dom.stageNameField.value = stage.name;
    dom.stageSubtitleField.value = stage.subtitle || "";
    dom.stageDescriptionField.value = stage.description || "";
    dom.stageSizeField.value = stage.size;
    dom.stageParField.value = stage.par;
    dom.stageDifficultyField.value = stage.difficulty;

    builderStart = [...stage.start];
    builderGoal = [...stage.goal];
    builderObstacles = new Set(stage.obstacles.map((coord) => `${coord[0]},${coord[1]}`));
    dom.stageModalTitle.textContent = "Edit game stage";
  } else {
    editingStage = null;
    dom.stageFormIsEdit.value = "false";
    dom.stageIdField.value = "";
    dom.stageIdField.readOnly = false;
    dom.stageNumberField.value = String(stages.length + 1).padStart(2, "0");
    dom.stageNameField.value = "";
    dom.stageSubtitleField.value = "";
    dom.stageDescriptionField.value = "";
    dom.stageSizeField.value = "5";
    dom.stageParField.value = "8";
    dom.stageDifficultyField.value = "1";

    builderStart = [0, 0];
    builderGoal = [4, 4];
    builderObstacles = new Set();
    dom.stageModalTitle.textContent = "Create game stage";
  }

  setBrush("obstacle");
  updateCoordinateLabels();
  renderGridBuilder();

  // Auto slug generation for new stages
  dom.stageNameField.addEventListener("input", handleNameInputToSlug);

  dom.stageModal.hidden = false;
}

function handleNameInputToSlug() {
  if (dom.stageFormIsEdit.value === "true") return;
  const name = dom.stageNameField.value;
  dom.stageIdField.value = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function setBrush(brush) {
  builderBrush = brush;
  dom.brushButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.brush === brush);
  });
}

// Ensure elements exist before updates
function updateCoordinateLabels() {
  if (dom.stageStartLabel) dom.stageStartLabel.textContent = `[${builderStart[0]}, ${builderStart[1]}]`;
  if (dom.stageGoalLabel) dom.stageGoalLabel.textContent = `[${builderGoal[0]}, ${builderGoal[1]}]`;
  checkPassability();
}

function handleGridSizeChange() {
  let size = parseInt(dom.stageSizeField.value, 10);
  if (isNaN(size) || size < 3) size = 3;
  if (size > 20) size = 20;

  dom.stageSizeField.value = size;

  builderStart[0] = Math.min(builderStart[0], size - 1);
  builderStart[1] = Math.min(builderStart[1], size - 1);

  builderGoal[0] = Math.min(builderGoal[0], size - 1);
  builderGoal[1] = Math.min(builderGoal[1], size - 1);

  if (builderStart[0] === builderGoal[0] && builderStart[1] === builderGoal[1]) {
    builderGoal[0] = (builderStart[0] + 1) % size;
    builderGoal[1] = (builderStart[1] + 1) % size;
  }

  const validObstacles = new Set();
  builderObstacles.forEach((key) => {
    const [ox, oy] = key.split(",").map(Number);
    if (ox < size && oy < size) {
      validObstacles.add(key);
    }
  });
  builderObstacles = validObstacles;

  updateCoordinateLabels();
  renderGridBuilder();
}

function renderGridBuilder() {
  const size = parseInt(dom.stageSizeField.value, 10) || 5;
  dom.gridBuilderCanvas.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  dom.gridBuilderCanvas.innerHTML = "";

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = document.createElement("div");
      cell.className = "grid-builder-cell";
      cell.dataset.x = x;
      cell.dataset.y = y;

      const isStart = builderStart[0] === x && builderStart[1] === y;
      const isGoal = builderGoal[0] === x && builderGoal[1] === y;
      const key = `${x},${y}`;
      const isObstacle = builderObstacles.has(key);

      if (isStart) {
        cell.classList.add("cell-start");
        cell.textContent = "S";
      } else if (isGoal) {
        cell.classList.add("cell-goal");
        cell.textContent = "G";
      } else if (isObstacle) {
        cell.classList.add("cell-obstacle");
      }

      cell.addEventListener("mousedown", (e) => {
        e.preventDefault();
        handleCellClick(x, y);
        isDrawing = true;
        if (builderBrush === "obstacle") {
          drawMode = !isObstacle;
        }
      });

      cell.addEventListener("mouseenter", () => {
        if (isDrawing && builderBrush === "obstacle") {
          const cellKey = `${x},${y}`;
          const currentIsStart = builderStart[0] === x && builderStart[1] === y;
          const currentIsGoal = builderGoal[0] === x && builderGoal[1] === y;
          if (!currentIsStart && !currentIsGoal) {
            if (drawMode) {
              builderObstacles.add(cellKey);
            } else {
              builderObstacles.delete(cellKey);
            }
            renderGridBuilder();
          }
        }
      });

      dom.gridBuilderCanvas.appendChild(cell);
    }
  }
}

function handleCellClick(x, y) {
  const cellKey = `${x},${y}`;
  const isStart = builderStart[0] === x && builderStart[1] === y;
  const isGoal = builderGoal[0] === x && builderGoal[1] === y;

  if (builderBrush === "start") {
    if (isGoal) {
      showToast("Start coordinate cannot overlap with Goal", true);
      return;
    }
    builderObstacles.delete(cellKey);
    builderStart = [x, y];
  } else if (builderBrush === "goal") {
    if (isStart) {
      showToast("Goal coordinate cannot overlap with Start", true);
      return;
    }
    builderObstacles.delete(cellKey);
    builderGoal = [x, y];
  } else if (builderBrush === "obstacle") {
    if (isStart || isGoal) return;
    if (builderObstacles.has(cellKey)) {
      builderObstacles.delete(cellKey);
    } else {
      builderObstacles.add(cellKey);
    }
  }

  updateCoordinateLabels();
  renderGridBuilder();
}

async function handleStageFormSubmit(e) {
  e.preventDefault();
  dom.stageFormError.textContent = "";
  dom.stageFormError.hidden = true;

  if (!checkPassability()) {
    dom.stageFormError.textContent = "Cannot save: Stage is impossible to solve (no passable route from Start to Goal).";
    dom.stageFormError.hidden = false;
    return;
  }

  dom.saveStageButton.disabled = true;

  const isEdit = dom.stageFormIsEdit.value === "true";
  const id = dom.stageIdField.value.trim();
  const number = dom.stageNumberField.value.trim();
  const name = dom.stageNameField.value.trim();
  const subtitle = dom.stageSubtitleField.value.trim();
  const description = dom.stageDescriptionField.value.trim();
  const size = parseInt(dom.stageSizeField.value, 10);
  const par = parseInt(dom.stageParField.value, 10);
  const difficulty = parseInt(dom.stageDifficultyField.value, 10);

  const obstacles = Array.from(builderObstacles).map((key) => key.split(",").map(Number));

  const payload = {
    id,
    number,
    name,
    subtitle,
    description,
    size,
    start: builderStart,
    goal: builderGoal,
    par,
    difficulty,
    obstacles,
  };

  try {
    if (isEdit) {
      await apiRequest(`/api/admin/missions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      showToast("Stage updated");
    } else {
      await apiRequest("/api/admin/missions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast("Stage created");
    }
    dom.stageNameField.removeEventListener("input", handleNameInputToSlug);
    dom.stageModal.hidden = true;
    await refreshAll();
  } catch (error) {
    dom.stageFormError.textContent = error.message;
    dom.stageFormError.hidden = false;
  } finally {
    dom.saveStageButton.disabled = false;
  }
}

function checkPassability() {
  const size = parseInt(dom.stageSizeField.value, 10) || 5;
  const shortestPath = findShortestPath(size, builderStart, builderGoal, builderObstacles);
  const passable = shortestPath !== -1;
  
  if (dom.stagePassableBadge) {
    if (passable) {
      dom.stagePassableBadge.textContent = `Passable (${shortestPath} steps)`;
      dom.stagePassableBadge.style.background = "rgba(93, 176, 117, 0.15)";
      dom.stagePassableBadge.style.color = "#5db075";
      dom.stagePassableBadge.style.border = "1px solid rgba(93, 176, 117, 0.3)";
      
      // Update minimum par steps
      if (dom.stageParField) {
        dom.stageParField.min = shortestPath;
        const currentPar = parseInt(dom.stageParField.value, 10);
        if (isNaN(currentPar) || currentPar < shortestPath) {
          dom.stageParField.value = shortestPath;
        }
      }
    } else {
      dom.stagePassableBadge.textContent = "No Path";
      dom.stagePassableBadge.style.background = "rgba(239, 68, 68, 0.15)";
      dom.stagePassableBadge.style.color = "#ef4444";
      dom.stagePassableBadge.style.border = "1px solid rgba(239, 68, 68, 0.3)";
      
      if (dom.stageParField) {
        dom.stageParField.removeAttribute("min");
      }
    }
  }
  return passable;
}

function findShortestPath(size, start, goal, obstacles) {
  const queue = [[start[0], start[1], 0]];
  const visited = new Set([`${start[0]},${start[1]}`]);

  while (queue.length > 0) {
    const [cx, cy, steps] = queue.shift();
    if (cx === goal[0] && cy === goal[1]) {
      return steps;
    }

    const directions = [
      [0, -1], // Up
      [0, 1],  // Down
      [-1, 0], // Left
      [1, 0]   // Right
    ];

    for (const [dx, dy] of directions) {
      const nx = cx + dx;
      const ny = cy + dy;
      const key = `${nx},${ny}`;

      if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
        if (!obstacles.has(key) && !visited.has(key)) {
          visited.add(key);
          queue.push([nx, ny, steps + 1]);
        }
      }
    }
  }

  return -1;
}
