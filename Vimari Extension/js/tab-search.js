/*
 * Implements a lightweight "omnibar" overlay used for two Vimium-inspired actions that Safari's
 * extension API can't fully replicate:
 *
 *  - Tab search (default: shift+t) lists every open tab in the current window, filterable by
 *    title/URL, so you can jump to one without the mouse.
 *  - Quick open (default: shift+o) is a simplified stand-in for Vimium's omnibar. Safari's
 *    extension API exposes no bookmarks/history, so this just opens whatever URL or search query
 *    you type in a new tab, with no suggestions.
 */

var omnibarContainer = null;
var omnibarInput = null;
var omnibarList = null;
var omnibarMode = null; // 'tabs' | 'openUrl'
var omnibarModeActivated = false;
var omnibarTabs = [];
var omnibarFilteredTabs = [];
var omnibarSelectedIndex = 0;

function activateTabSearchMode() {
  if (omnibarModeActivated) return;
  openOmnibar('tabs', 'Search open tabs…');
  renderTabList([{ title: 'Loading tabs…', url: '', index: -1 }]);
  extensionCommunicator.requestTabList();
}

function activateOpenUrlPromptMode() {
  if (omnibarModeActivated) return;
  openOmnibar('openUrl', 'Enter a URL or search…');
}

// Called from injected.js's messageHandler when the "tabListResult" message arrives.
function onTabListResult(tabs) {
  if (!omnibarModeActivated || omnibarMode !== 'tabs') return;
  omnibarTabs = tabs || [];
  filterAndRenderTabs();
}

function openOmnibar(mode, placeholder) {
  omnibarMode = mode;
  omnibarModeActivated = true;
  omnibarSelectedIndex = 0;
  omnibarTabs = [];
  omnibarFilteredTabs = [];

  omnibarContainer = document.createElement('div');
  omnibarContainer.className = 'vimiumOmnibar vimiumReset';

  omnibarInput = document.createElement('input');
  omnibarInput.className = 'vimiumOmnibarInput vimiumReset';
  omnibarInput.setAttribute('type', 'text');
  omnibarInput.setAttribute('placeholder', placeholder);
  omnibarInput.setAttribute('spellcheck', 'false');
  omnibarInput.setAttribute('autocomplete', 'off');

  omnibarList = document.createElement('div');
  omnibarList.className = 'vimiumOmnibarList vimiumReset';

  omnibarContainer.appendChild(omnibarInput);
  if (mode === 'tabs') {
    omnibarContainer.appendChild(omnibarList);
  }
  document.body.appendChild(omnibarContainer);

  omnibarInput.addEventListener('keydown', onOmnibarKeyDown, true);
  omnibarInput.addEventListener('input', onOmnibarInput, true);
  omnibarInput.focus();
}

function onOmnibarInput() {
  if (omnibarMode === 'tabs') {
    filterAndRenderTabs();
  }
}

function filterAndRenderTabs() {
  var query = omnibarInput.value.toLowerCase().trim();
  omnibarFilteredTabs = !query ? omnibarTabs : omnibarTabs.filter(function(tab) {
    return tab.title.toLowerCase().indexOf(query) >= 0 ||
           tab.url.toLowerCase().indexOf(query) >= 0;
  });
  omnibarSelectedIndex = 0;
  renderTabList(omnibarFilteredTabs);
}

function renderTabList(tabs) {
  omnibarList.innerHTML = '';
  tabs.forEach(function(tab, i) {
    var item = document.createElement('div');
    item.className = 'vimiumOmnibarListItem vimiumReset' + (i === omnibarSelectedIndex ? ' selected' : '');

    var title = document.createElement('div');
    title.className = 'vimiumOmnibarTitle vimiumReset';
    title.textContent = tab.title || tab.url || 'Untitled tab';

    var url = document.createElement('div');
    url.className = 'vimiumOmnibarUrl vimiumReset';
    url.textContent = tab.url || '';

    item.appendChild(title);
    item.appendChild(url);
    item.addEventListener('click', function() {
      omnibarSelectedIndex = i;
      confirmOmnibar();
    });
    omnibarList.appendChild(item);
  });
}

function onOmnibarKeyDown(event) {
  if (isEscape(event)) {
    deactivateOmnibar();
    event.stopPropagation();
    event.preventDefault();
    return;
  }

  if (omnibarMode === 'tabs') {
    if (event.keyCode === 40 /* down */) {
      moveOmnibarSelection(1);
      event.stopPropagation();
      event.preventDefault();
      return;
    }
    if (event.keyCode === 38 /* up */) {
      moveOmnibarSelection(-1);
      event.stopPropagation();
      event.preventDefault();
      return;
    }
  }

  if (event.keyCode === keyCodes.enter) {
    confirmOmnibar();
    event.stopPropagation();
    event.preventDefault();
    return;
  }

  // Let ordinary typing reach the input as usual, but keep it from leaking through to the
  // underlying page or triggering other Vimari keybindings while the omnibar is open.
  event.stopPropagation();
}

function moveOmnibarSelection(delta) {
  if (omnibarFilteredTabs.length === 0) return;
  omnibarSelectedIndex = (omnibarSelectedIndex + delta + omnibarFilteredTabs.length) % omnibarFilteredTabs.length;
  renderTabList(omnibarFilteredTabs);
}

function confirmOmnibar() {
  if (omnibarMode === 'tabs') {
    var selectedTab = omnibarFilteredTabs[omnibarSelectedIndex];
    if (selectedTab && selectedTab.index >= 0) {
      extensionCommunicator.requestActivateTab(selectedTab.index);
    }
  } else if (omnibarMode === 'openUrl') {
    var query = omnibarInput.value.trim();
    if (query) {
      window.open(resolveOmnibarUrl(query, settings.searchEngineUrl));
    }
  }
  deactivateOmnibar();
}

/*
 * Turns whatever the user typed into a URL to navigate to: as-is if it already looks like a URL
 * (adding a https:// scheme if one is missing), otherwise as a query against searchEngineUrl.
 */
function resolveOmnibarUrl(input, searchEngineUrl) {
  if (looksLikeUrl(input)) {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : 'https://' + input;
  }
  return searchEngineUrl + encodeURIComponent(input);
}

function looksLikeUrl(input) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) return true;
  if (/\s/.test(input)) return false;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(input)) return true;
  return /^[^\s]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(input);
}

function deactivateOmnibar() {
  if (!omnibarModeActivated) return;
  omnibarInput.removeEventListener('keydown', onOmnibarKeyDown, true);
  omnibarInput.removeEventListener('input', onOmnibarInput, true);
  if (omnibarContainer && omnibarContainer.parentNode) {
    omnibarContainer.parentNode.removeChild(omnibarContainer);
  }
  omnibarContainer = null;
  omnibarInput = null;
  omnibarList = null;
  omnibarMode = null;
  omnibarModeActivated = false;
  omnibarTabs = [];
  omnibarFilteredTabs = [];
}

// Export for tests
window.looksLikeUrl = looksLikeUrl;
window.resolveOmnibarUrl = resolveOmnibarUrl;
