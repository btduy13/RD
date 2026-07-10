(function (root) {
  "use strict";

  // ── Registry: modal IDs mở dạng tab thay vì popup ──
  var TAB_REGISTRY = {
    "modal-add-purchase":        { label: "HĐ Mua hàng",   icon: "📥" },
    "modal-add-purchase-return": { label: "Trả hàng mua",   icon: "↩️" },
    "modal-add-purchase-order":  { label: "Đơn đặt hàng",   icon: "📋" },
    "modal-add-sales":           { label: "HĐ Bán hàng",    icon: "💰" },
    "modal-add-sales-return":    { label: "Trả hàng bán",   icon: "↩️" },
    "modal-add-sales-quotation": { label: "Báo giá",         icon: "📝" },
    "modal-edit-template":       { label: "Phiếu mẫu",      icon: "📄" },
    "modal-add-partner":         { label: "Đối tác",         icon: "👥" },
    "modal-add-product":         { label: "Sản phẩm",       icon: "📦" },
    "modal-add-receipt":         { label: "Phiếu thu",       icon: "📗" },
    "modal-add-payment":         { label: "Phiếu chi",       icon: "📕" }
  };

  // ── State ──
  var openTabs = [];       // [{ modalId, tabEl }]
  var activeTabId = null;  // modalId đang active, null = home

  // ── DOM helpers ──
  function getTabBar()      { return document.getElementById("workspace-tab-bar"); }
  function getTabBarInner() { return document.getElementById("workspace-tab-bar-tabs"); }

  function isTabRegistered(modalId) { return !!TAB_REGISTRY[modalId]; }
  function findOpenTab(modalId) { return openTabs.find(function (t) { return t.modalId === modalId; }); }
  function isWorkspaceTabOpen(modalId) { return !!findOpenTab(modalId); }

  // ── Tab bar visibility ──
  function updateTabBarVisibility() {
    var bar = getTabBar();
    if (bar) bar.style.display = openTabs.length > 0 ? "" : "none";
  }

  // ── Get home tab label from sidebar ──
  function getHomeLabel() {
    var activeMenu = document.querySelector(".sidebar-menu .menu-item.active");
    return activeMenu ? (activeMenu.querySelector("span") || {}).textContent || "Trang chủ" : "Trang chủ";
  }

  // ── Create tab element ──
  function createTabElement(modalId) {
    var config = TAB_REGISTRY[modalId];
    if (!config) return null;
    var tab = document.createElement("div");
    tab.className = "workspace-tab";
    tab.setAttribute("data-modal-id", modalId);
    tab.innerHTML =
      '<span class="workspace-tab-icon">' + config.icon + "</span>" +
      '<span class="workspace-tab-label">' + config.label + "</span>" +
      '<button class="workspace-tab-close" title="Đóng">✕</button>';
    tab.querySelector(".workspace-tab-close").addEventListener("click", function (e) {
      e.stopPropagation();
      root.closeModal(modalId);
    });
    tab.addEventListener("click", function () { switchToTab(modalId); });
    return tab;
  }

  // ── Render tab bar ──
  function renderTabBar() {
    var inner = getTabBarInner();
    if (!inner) return;
    inner.innerHTML = "";

    // Home tab
    var home = document.createElement("div");
    home.className = "workspace-tab workspace-tab-home" + (activeTabId === null ? " active" : "");
    home.innerHTML =
      '<span class="workspace-tab-icon">📋</span>' +
      '<span class="workspace-tab-label">' + getHomeLabel() + "</span>";
    home.addEventListener("click", function () { switchToTab(null); });
    inner.appendChild(home);

    // Form tabs
    openTabs.forEach(function (t) {
      t.tabEl.className = "workspace-tab" + (activeTabId === t.modalId ? " active" : "");
      inner.appendChild(t.tabEl);
    });

    updateTabBarVisibility();
  }

  // ── Show/hide content based on active tab ──
  function showActiveContent() {
    // Get current sidebar view
    var activeView = document.querySelector(".content-body .tab-view.active-tab");

    if (activeTabId === null) {
      // Home tab: show sidebar view, hide all form modals
      if (activeView) activeView.style.display = "";
      openTabs.forEach(function (t) {
        var modal = document.getElementById(t.modalId);
        if (modal) modal.style.display = "none";
      });
    } else {
      // Form tab: hide sidebar view, show only the active form modal
      if (activeView) activeView.style.display = "none";
      openTabs.forEach(function (t) {
        var modal = document.getElementById(t.modalId);
        if (modal) {
          modal.style.display = (t.modalId === activeTabId) ? "flex" : "none";
        }
      });
    }
  }

  // ── Switch to tab (null = home) ──
  function switchToTab(modalId) {
    if (modalId !== null && !findOpenTab(modalId)) return;
    activeTabId = modalId;
    renderTabBar();
    showActiveContent();
  }

  // ── Open form as workspace tab ──
  function openAsTab(modalId) {
    if (!isTabRegistered(modalId)) return false;

    // If already open, just switch
    var existing = findOpenTab(modalId);
    if (existing) {
      switchToTab(modalId);
      return true;
    }

    var tabEl = createTabElement(modalId);
    if (!tabEl) return false;

    // Add workspace-tab-panel class to modal (CSS makes it look like tab panel)
    var modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add("workspace-tab-panel");
    }

    openTabs.push({ modalId: modalId, tabEl: tabEl });
    activeTabId = modalId;
    renderTabBar();
    return true;
  }

  // ── Close workspace tab ──
  function closeTab(modalId) {
    var idx = -1;
    for (var i = 0; i < openTabs.length; i++) {
      if (openTabs[i].modalId === modalId) { idx = i; break; }
    }
    if (idx === -1) return false;

    var modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove("workspace-tab-panel");
    }

    openTabs.splice(idx, 1);

    if (activeTabId === modalId) {
      activeTabId = null;
    }

    renderTabBar();
    showActiveContent();
    return true;
  }

  // ── Close all tabs ──
  function closeAllTabs() {
    var toClose = openTabs.map(function (t) { return t.modalId; });
    toClose.forEach(function (id) {
      root.closeModal(id);
    });
  }

  // ── Patch openModal / closeModal ──
  function patchModalLifecycle() {
    var _prevOpen = root.openModal;
    var _prevClose = root.closeModal;

    root.openModal = function workspaceOpenModal(modalId) {
      if (isTabRegistered(modalId)) {
        openAsTab(modalId);
        // Let all layers run (accessibility, animation, draft, chrome)
        _prevOpen(modalId);
        // After layers run, enforce correct visibility
        showActiveContent();
        return;
      }
      _prevOpen(modalId);
    };

    root.closeModal = function workspaceCloseModal(modalId) {
      if (isWorkspaceTabOpen(modalId)) {
        // Let all layers run (save draft, teardown, hide)
        _prevClose(modalId);
        // Clean up tab state
        closeTab(modalId);
        return;
      }
      _prevClose(modalId);
    };
  }

  // ── Init ──
  function init() {
    patchModalLifecycle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // ── Exports ──
  root.isWorkspaceTab = isTabRegistered;
  root.isWorkspaceTabOpen = isWorkspaceTabOpen;
  root.switchWorkspaceTab = switchToTab;
  root.closeAllWorkspaceTabs = closeAllTabs;
  root.updateHomeTabLabel = function () { renderTabBar(); };

})(window);
